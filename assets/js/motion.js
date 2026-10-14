/* =====================================================================
   Man Patel — motion layer
   Rolling numbers, text reveals, the hero globe, pointer effects
   (tilt, spotlight, magnetic), scroll-linked text and the animated FAQ.
   main.js uses MP.odo and MP.tween. Under reduced motion everything is
   shown in its final state, without movement.
   ===================================================================== */
(function () {
  "use strict";

  var REDUCE = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var FINE = matchMedia("(hover:hover) and (pointer:fine)").matches;
  var MP = window.MP = { REDUCE: REDUCE, FINE: FINE };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function each(sel, fn) { [].forEach.call(document.querySelectorAll(sel), fn); }

  /* ---------- easing + tween ---------- */
  MP.ease = {
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  };
  // calls step(eased 0..1) every frame; returns a function that stops it
  MP.tween = function (dur, ease, step, done) {
    var t0 = null, live = true;
    function f(now) {
      if (!live) return;
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / dur);
      step(ease(k));
      if (k < 1) requestAnimationFrame(f); else { live = false; if (done) done(); }
    }
    requestAnimationFrame(f);
    return function () { live = false; };
  };

  /* ---------- odometer: each digit rolls to its new value ----------
     A transparent copy of the text sets the layout and is what screen
     readers and copy-paste get; the rolling digits sit on top of it.
     Digits stay at their start value until the number is first seen. */
  var ROW = 1.4; // em: a digit row is taller than the line, so glyphs never clip
  var seen = typeof WeakSet === "function" ? new WeakSet() : null;
  var odoIO = seen && "IntersectionObserver" in window ? new IntersectionObserver(function (es) {
    es.forEach(function (en) {
      if (!en.isIntersecting) return;
      odoIO.unobserve(en.target); seen.add(en.target); roll(en.target, true);
    });
  }, { rootMargin: "0px 0px -2% 0px" }) : null;

  function digitsOf(s) { return (String(s).match(/\d/g) || []).map(Number); }
  function strip(d) {
    var s = '<span class="odo-d"><span class="odo-s" style="transform:translateY(' + (-ROW * d) + 'em)">';
    for (var i = 0; i < 10; i++) s += "<span>" + i + "</span>";
    return s + "</span></span>";
  }
  function build(el, st, text, from) {
    // new columns start from the previous digits, matched from the right
    var src = digitsOf(from), off = src.length - digitsOf(text).length, k = 0, html = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch >= "0" && ch <= "9") { var j = k + off; html += strip(j >= 0 && j < src.length ? src[j] : 0); k++; }
      else html += '<span class="odo-c">' + (ch === " " ? "&nbsp;" : esc(ch)) + "</span>";
    }
    el.innerHTML = '<span class="odo"><span class="odo-g"></span><span class="odo-o" aria-hidden="true">' + html + "</span></span>";
    st.g = el.querySelector(".odo-g");
    st.s = [].slice.call(el.querySelectorAll(".odo-s"));
    st.pattern = text.replace(/\d/g, "0");
  }
  // the advance width of each digit in this element's font: a column takes the
  // width of the digit it lands on, so the rolling copy matches the text exactly
  var widths = {};
  function digitWidths(el) {
    var cs = getComputedStyle(el), key = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.fontVariationSettings].join("|");
    if (widths[key]) return widths[key];
    var probe = document.createElement("span"), w;
    probe.className = "odo-probe"; probe.innerHTML = "<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span><span>9</span>";
    el.appendChild(probe);
    w = [].map.call(probe.children, function (c) { return c.getBoundingClientRect().width; });
    el.removeChild(probe);
    if (w.every(function (x) { return x > 0; })) { widths[key] = w; return w; }
    return null; // not laid out yet (hidden): columns keep their natural width
  }
  function roll(el, first) {
    var st = el._odo; if (!st || !st.s) return;
    // widths measured in a fallback font would be wrong once the web font lands
    if (document.fonts && document.fonts.status === "loading") { document.fonts.ready.then(function () { roll(el, first); }); return; }
    var ds = digitsOf(st.text), w = digitWidths(st.g.parentNode);
    st.s.forEach(function (s, i) {
      s.style.transitionDelay = first ? (i * 0.045).toFixed(3) + "s" : "0s";
      s.style.transform = "translateY(" + (-ROW * ds[i]) + "em)";
      if (w) { s.parentNode.style.transitionDelay = s.style.transitionDelay; s.parentNode.style.width = w[ds[i]].toFixed(2) + "px"; }
    });
  }
  // opt.fast: short roll (scrubbing); opt.from: starting value on first build
  MP.odo = function (el, text, opt) {
    text = String(text); opt = opt || {};
    if (REDUCE || !seen) { el.textContent = text; return; }
    var st = el._odo, fresh = !st;
    if (fresh) st = el._odo = {};
    else if (st.text === text) return;
    if (fresh || st.pattern !== text.replace(/\d/g, "0")) { build(el, st, text, fresh ? (opt.from || "") : st.text); void el.offsetWidth; }
    st.text = text; st.g.textContent = text;
    el.style.setProperty("--odo-dur", opt.fast ? ".42s" : "1.1s");
    if (fresh) { if (odoIO) odoIO.observe(el); else seen.add(el); }
    if (seen.has(el)) roll(el, false);
  };

  /* ---------- scramble: a mono label decodes into place ---------- */
  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  MP.scramble = function (el, dur) {
    if (REDUCE || !el || el._scr) return;
    el._scr = true;
    var fin = el.textContent, n = fin.length, t0 = null;
    function f(now) {
      if (t0 === null) t0 = now;
      var k = Math.min(1, (now - t0) / (dur || 700)), r = Math.floor(k * n), s = fin.slice(0, r);
      for (var i = r; i < n; i++) s += /[\s·.,&]/.test(fin.charAt(i)) ? fin.charAt(i) : GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
      el.textContent = s;
      if (k < 1) requestAnimationFrame(f); else el.textContent = fin;
    }
    requestAnimationFrame(f);
  };

  /* ---------- section headings: words rise out of a mask ---------- */
  function splitWords(node, wrap) {
    var words = node.textContent.trim().split(/\s+/);
    node.innerHTML = words.map(function (w, i) { return wrap(esc(w), i); }).join(" ");
    return words.length;
  }
  if (!REDUCE) {
    each(".sec-head h2", function (h) {
      splitWords(h, function (w, i) { return '<span class="w"><span class="wi" style="--i:' + i + '">' + w + "</span></span>"; });
    });
    if ("IntersectionObserver" in window) {
      var sio = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (!en.isIntersecting) return;
          sio.unobserve(en.target);
          var n = en.target.querySelector(".sec-num");
          if (n) setTimeout(function () { MP.scramble(n, 520); }, 120);
        });
      }, { rootMargin: "0px 0px -8% 0px" });
      each(".sec-head", function (s) { sio.observe(s); });
    }
    var eb = document.querySelector(".hero .eyebrow");
    if (eb) setTimeout(function () { MP.scramble(eb, 950); }, 140);
  }

  /* ---------- the approach lede lights up word by word as it scrolls ---------- */
  var scrub = document.querySelector("[data-scrub]");
  if (scrub && !REDUCE) {
    scrub.style.setProperty("--n", splitWords(scrub, function (w, i) { return '<span class="sw" style="--i:' + i + '">' + w + "</span>"; }));
    scrub.classList.add("scrub");
  }

  /* ---------- scroll-linked: lede progress + hero globe parallax ---------- */
  var bg = document.getElementById("heroBg"), ticking = false;
  function onScroll() {
    ticking = false;
    var vh = window.innerHeight;
    if (scrub && !REDUCE) {
      var r = scrub.getBoundingClientRect(), p = (vh * 0.88 - r.top) / (vh * 0.5);
      scrub.style.setProperty("--p", Math.max(0, Math.min(1, p)).toFixed(3));
    }
    if (bg && !REDUCE) { var y = window.scrollY || window.pageYOffset; if (y < vh * 1.6) bg.style.transform = "translate3d(0," + (y * 0.22).toFixed(1) + "px,0)"; }
  }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- hero: "follow the sun" globe ----------
     A dotted globe turning slowly behind the hero. Light travels between the
     cities where KBAD's instruments trade, in session order (Asia, Europe, the
     US), taken from the live asset mix (main.js calls MP.markets). The pointer
     turns and tilts it. Land is 16,000 evenly spread points, one bit each
     (Natural Earth, 1:110m). Paused off-screen and in background tabs; a
     single still frame under reduced motion. */
  (function heroGlobe() {
    MP.markets = function () {};
    var cv = bg, ctx = cv && cv.getContext && cv.getContext("2d");
    if (!ctx) return;
    var hero = cv.closest(".hero") || cv.parentNode;
    var LAND = "AAAAAAAAABAAQkBIAAhJIQshJISEhIAUEBJCAkLAAJk6IQNgZAAMhIEDMnIADsTYgZk5Mkdi7sjMuplpcfFsbu3MprzWNv/6Wtvf+zt/f+3t/v2Vv7/+9t722tv5/ztvf+/t/f+dt/v21v7+2lv5eztv9++tvN29t/L3Vsbu31t5Oysn5e+snJ2Xk3J3VmbO3Um5OSMr5+ak7JyR03JzQn7OzWmZOSMv5+aE7Jy70zNzQn7OzInZOTG3Z+bk/Jybk3NzRm7Pzen5OTU35+bk3J6b03NzSm7Ozem5OTW35+bU3Jybk3Nzak7Pzem5OTUn5+T0nJyb03Nzam7Pzak5OTW35+bUnJybU3Nyam7Ozem5OTWn5+bUnJybUXNzakbOzak5OTGj5ubUnJybUXNyakbNzeg5OTOj5uTEjJqTkXN6akbNyYg5NSOj5+TEjJqREXNqTk7NyYkZNScmZ9SEnJqTE3NqRk7MyYk5NSMmZtSEmJiTE3NqRkzOqQk5NSMmZtSUmJyTE3NqRk7MqAk5MSOmZtSEjJ6RUzJiRkzNiAkZPSOmZvSEmJqREzJ6RkzN6AkZNSOmZNSEmJpREzJqRkzJ6Ak5NSOmZNSEmJLRUzJqTkzJqAk5JaemZNSEmJJRU3JqTkzJqSkxJaem5NSUmJJTUnJqSk3JKSkxJaem5JSUmJJTUGJKSknJKSkxJaek5NSUkpJTUGJKSknJKCklJaekxFSckpJTUGpKSknJKCglJaekxJSUkpJTUEpKSkmJKCklBaek1BSckgJTUEoKSkmpKCklBaeklBSckgJTUkoKSkmpKCklBaamlBSUkkJTUkoKSEmpoSklBaaklBSQmkJBUkoKTEmhqSA1BYaElFSQkkJBQEoqDAkpKSA1hYaklBSQkkJBQGoqDAmpKSAlhYaA1BQQklJBQGoKCgGpKSAkhYaA1BQQglJBQEoKCwGpISAEhYKA1BQUglJCQGgKCQGpKSAUhYCA0BQWglJCQCgKCQGpKSAEpYCAUBQWAlJCQCgKCQEhICgEpYCAUBQSAlJQQAgKCQEhICQEpICAUBQSAlJAQQgKCQUhISwEpISCUFQSAkJCQQgoCQUhoCQEhKSCUFASCkJCQShICQUhqCwUpISCUFASCkJAUQgICQUhoCwUpISCUFASCkJAUQgISQUhoCQUhICCEFASCkJAUSgoSQUBoCQUlYCCEFASigJAQSgoQAUBoCQVFYCCAFAQCgJAQSgqQAUBoCAVFICCQFQACgJAQSgqAAUBqAAVBICCUFQACgJAQSgqAAWBqAAVBICiUFQACgJRASgoAAWBqAAVBaACUFQACgJRASoqAAWgqAAVBKICUFAACgJRESooAAWgqAAVFKICUFAACkBRASooBAWgoAgVFKIiUFQECkhRASooBAWkoAgUEIICUFQMCkhBESooBgXkoAgUEIICUFQMCkhBESogBgWkoAgUEIMCUFAMCkhBESogBkWkoAgVEIICcECMCkhBESogBAWgoBgVkIIiUECICkhBESggBAWgoBAUkIICUEAMCkBBASggBAWggBAUkKICUEAICkBBASggBAWggBAUgIICUEAICkBBASggBQWggBAUgIIiUEAICkABISgCBQWggBAUgYICUAQKCkABISgKBUWgiBAUgIICUAQKCkARISgABUWgiBQUgCICUBQKCkARISgCBUWgKBQUgCIDUBQKikBRKSgCRUSgKBQUgCICUASKiEBRCCgCRQSgKBQQgaICUASKiEBRKCgCRQSgCBQRgaIQUASKiEBRKCICRUSgCBQRgaIQVASKiEARKCICRQGoCBQRgaJQVASKiFARKCICRQGoCBQRgSJQRASKglARKCICRaGoCBQBoSJQRASKglARKAICRaCICBQBoSJQBASKgBARKAICRaAICBQBoSJQBASKgBERKAJCRaAICBQBISJQBASKQBERKAJCRaAICBQBIyJQBASKQBEQKAJCRKAICBQBIyBQBISIQBEQKAJGRKAICBQBIiBQBISIQBEQKAJGQKAICBABIiBQAISAQAEQIABEQKAACBGBIiBQAIiAQAEQIAAEQIAACAGBAiAAAAiAAAEQAAAEQIAAEAAAAiAAAAiAAAEQAAAEQIAAEAAAAiAAAAiEAAEgAAAEQgAAEAAAAgAAAAgEAAAgAAAEAAAAEAgAAEAAAAgAAAAgAAAEQAAAEAgAAEAAAACAAAAgEAAAgAAAEAAAAEAgAACAAAAgAAAAgEAAAAAAAEAAAAAAgQAgAAAAgAAAAAAAAEAAAAAAgQAAAAAAgAAAAAAAAEAAAAAAAQAAAAAAgAAAAAACAAAAAAAAAQAAAAAAgAEAAAACAAAAAAAAAQAAAAQAAAAAEAACAAAAAAAAAQAAAAQAAAAAAAAAAAAAAAAAAQAAAAQAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    var D2R = Math.PI / 180, NPTS = 16000, PTS = [];
    var W = 0, Hh = 0, cx = 0, cy = 0, R = 0, fadeX = 0, dim = 1, labelY = 0, story = true;
    var sage = [63, 86, 72], gold = [156, 123, 63], ink = [35, 32, 27], paper = [244, 241, 233], dk = false;
    var t = 0, last = 0, on = false, inView = true, rotOff = 0, tiltOff = 0;
    var m = { x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0 };
    // [latitude, longitude, label, session order]
    var CITY = { sydney: [-33.87, 151.21, "SYDNEY", 0], tokyo: [35.68, 139.69, "TOKYO", 1], hongkong: [22.32, 114.17, "HONG KONG", 2], frankfurt: [50.11, 8.68, "FRANKFURT", 3], london: [51.51, -0.13, "LONDON", 4], newyork: [40.71, -74.01, "NEW YORK", 5] };
    var VENUE = { NI225: "tokyo", JP225: "tokyo", JPN225: "tokyo", USDJPY: "tokyo", HSI: "hongkong", HK50: "hongkong", AUS200: "sydney", GDAXI: "frankfurt", GDAXIm: "frankfurt", DE40: "frankfurt",
      XTIUSD: "newyork", NDX: "newyork", NDXm: "newyork", SPX500: "newyork", SP500: "newyork", US500: "newyork", WS30: "newyork", US30: "newyork", US2000: "newyork" };
    var SHORT = { NI225: "Nikkei 225", JP225: "Nikkei 225", XAGUSD: "Silver", XAUUSD: "Gold", XTIUSD: "Oil", XBRUSD: "Brent", NDX: "Nasdaq 100", NDXm: "Nasdaq 100", GDAXI: "DAX 40", GDAXIm: "DAX 40",
      SPX500: "S&P 500", SP500: "S&P 500", US500: "S&P 500", WS30: "Dow", US30: "Dow", EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", HSI: "Hang Seng", HK50: "Hang Seng", AUS200: "ASX 200" };
    var venues = [];
    function vec(lat, lon) { return [Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), Math.cos(lat * D2R) * Math.cos(lon * D2R)]; }
    // six-letter pairs (FX, gold, silver) trade around London; other single names are US-listed
    function venueOf(n) { return VENUE[n] || (/^[A-Z]{6}$/.test(n) ? "london" : "newyork"); }
    MP.markets = function (mix) {
      var by = {};
      (mix || []).forEach(function (x) { var v = venueOf(x.name); (by[v] = by[v] || { w: 0, list: [] }).w += x.pct; by[v].list.push(x); });
      venues = Object.keys(by).filter(function (k) { return by[k].w >= 0.03; }).sort(function (a, b) { return CITY[a][3] - CITY[b][3]; }).map(function (k) {
        var c = CITY[k], names = by[k].list.filter(function (x) { return x.pct >= 0.01; }).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 2).map(function (x) { return SHORT[x.name] || x.name; });
        return { label: c[2], sub: names.join(" · "), p: vec(c[0], c[1]) };
      });
      // great-circle arcs to the next session's city, lifted off the surface
      venues.forEach(function (v, i) {
        var b = venues[(i + 1) % venues.length].p, a = v.p, om = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])), pts = [];
        if (venues.length < 2 || om < 0.01) { v.arc = null; return; }
        for (var s = 0; s <= 64; s++) {
          var u = s / 64, k1 = Math.sin((1 - u) * om) / Math.sin(om), k2 = Math.sin(u * om) / Math.sin(om), lift = 1 + 0.16 * Math.sin(Math.PI * u) * (om / 2);
          pts.push([(a[0] * k1 + b[0] * k2) * lift, (a[1] * k1 + b[1] * k2) * lift, (a[2] * k1 + b[2] * k2) * lift]);
        }
        v.arc = pts;
      });
      if (!on) draw();
    };
    // until the live mix arrives: what KBAD trades today
    MP.markets([{ name: "NI225", pct: 0.35 }, { name: "XAGUSD", pct: 0.28 }, { name: "XTIUSD", pct: 0.18 }, { name: "NDXm", pct: 0.15 }, { name: "XAUUSD", pct: 0.02 }]);
    (function land() {
      var bits = atob(LAND), ga = Math.PI * (3 - Math.sqrt(5));
      for (var i = 0; i < NPTS; i++) if (bits.charCodeAt(i >> 3) & (1 << (i & 7))) {
        var y = 1 - (i + 0.5) / NPTS * 2, r = Math.sqrt(1 - y * y), th = ga * i;
        PTS.push(Math.cos(th) * r, y, Math.sin(th) * r);
      }
    })();
    var BUCKETS = []; for (var b = 0; b < 18; b++) BUCKETS.push([]);
    function hex(s) {
      s = String(s).trim().replace("#", "");
      if (s.length === 3) s = s.replace(/./g, "$&$&");
      var n = parseInt(s, 16);
      return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }
    function dark() { var a = document.documentElement.getAttribute("data-theme"); return a ? a === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
    function colors() {
      var cs = getComputedStyle(document.documentElement), g = function (n, d) { return hex(cs.getPropertyValue(n)) || d; };
      sage = g("--sage", sage); gold = g("--gold", gold); ink = g("--ink", ink); paper = g("--paper", paper); dk = dark();
      if (!on) draw();
    }
    function top(el) { var y = 0; while (el && el !== hero) { y += el.offsetTop; el = el.offsetParent; } return y; } // ignores the reveal transforms
    function size() {
      var r = cv.getBoundingClientRect(); W = r.width; Hh = r.height;
      if (!W || !Hh) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var card = document.getElementById("heroCard"), lede = hero.querySelector(".lede"), h1 = hero.querySelector("h1");
      var cr = card && !card.hidden && card.offsetWidth ? card.getBoundingClientRect() : null, lr = lede && lede.getBoundingClientRect();
      if (cr && lr && cr.left > lr.right - 20) {
        // desktop: between the copy and the live card, sinking behind the stats
        var cl = lr.left, cw = cr.right - cl;
        R = Math.min(cw * 0.34, Hh * 0.44); cx = cl + cw * 0.6 - r.left; cy = top(card) + card.offsetHeight * 0.86; fadeX = lr.right - r.left; dim = 1; labelY = 0; story = true;
      } else {
        // tablet and phone: a partial globe rising from the right edge, quieter behind the text
        var phone = W < 640;
        R = Math.min(W * (phone ? 0.5 : 0.36), 340); cx = W - R * (phone ? 0.3 : 0.55); cy = (h1 ? top(h1) : 120) + R * (phone ? 0.5 : 0.7); fadeX = W * 0.5; dim = phone ? 0.42 : 0.8;
        labelY = h1 ? top(h1) - 6 : 0; story = !phone; // phones: just the globe; tablets: the story below the eyebrow
      }
      draw();
    }
    function draw() {
      if (!W || !R) return;
      ctx.clearRect(0, 0, W, Hh);
      var lon0 = (40 - t * 0.005 + rotOff) * D2R, tilt = (22 + tiltOff) * D2R; // west to east, like the Earth
      var cl = Math.cos(lon0), sl = Math.sin(lon0), ct = Math.cos(tilt), st = Math.sin(tilt);
      function proj(x, y, z) { var X1 = x * cl - z * sl, Z1 = x * sl + z * cl; return [cx + X1 * R, cy - (y * ct - Z1 * st) * R, y * st + Z1 * ct]; }
      // atmosphere, body and rim
      var g = ctx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.22);
      g.addColorStop(0, rgba(sage, (dk ? 0.16 : 0.1) * dim)); g.addColorStop(1, rgba(sage, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, 7); ctx.fill();
      var body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, dk ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.5)"); body.addColorStop(1, rgba(paper, 0));
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.strokeStyle = rgba(sage, (dk ? 0.28 : 0.22) * dim); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      // land: far side as faint specks; near side bucketed by depth and by how close it sits to the copy
      var i, k, s, arr;
      for (k = 0; k < 18; k++) BUCKETS[k].length = 0;
      ctx.fillStyle = rgba(sage, (dk ? 0.07 : 0.06) * dim);
      for (i = 0; i < PTS.length; i += 3) { // projected inline: no allocation per point
        var x = PTS[i], y = PTS[i + 1], z = PTS[i + 2], X1 = x * cl - z * sl, Z1 = x * sl + z * cl;
        var px = cx + X1 * R, py = cy - (y * ct - Z1 * st) * R, pz = y * st + Z1 * ct;
        if (pz < 0) { if (i % 2 === 0) ctx.fillRect(px - 0.5, py - 0.5, 1, 1); continue; }
        var fb = px < fadeX - 240 ? 0 : px < fadeX ? 1 : 2;
        BUCKETS[Math.min(5, Math.floor(pz * 6)) * 3 + fb].push(px, py, 1 + pz * 1.3);
      }
      for (k = 0; k < 18; k++) {
        arr = BUCKETS[k]; if (!arr.length) continue;
        ctx.fillStyle = rgba(sage, ((dk ? 0.25 : 0.22) + Math.floor(k / 3) * (dk ? 0.12 : 0.11)) * [0.4, 0.7, 1][k % 3] * dim);
        for (i = 0; i < arr.length; i += 3) { s = arr[i + 2]; ctx.fillRect(arr[i] - s / 2, arr[i + 1] - s / 2, s, s); }
      }
      // the story (arcs and cities) at full strength beside the copy, softened over it; none on phones
      if (!story) return;
      ctx.save(); ctx.beginPath(); ctx.rect(fadeX - 200, labelY, W, Hh); ctx.clip(); drawStory(proj, 1, true); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(0, labelY, Math.max(0, fadeX - 200), Hh); ctx.clip(); drawStory(proj, 0.3, false); ctx.restore();
    }
    function drawStory(proj, mul, labels) {
      // arcs: a faint path each, and a pulse of light travelling one leg after another
      var LEG = 2.6, n = venues.length, cyc = n ? ((t / 1000) % (LEG * n)) / LEG : 0, leg = Math.floor(cyc), u = cyc - leg;
      venues.forEach(function (v, vi) {
        if (!v.arc) return;
        var pts = v.arc.map(function (p) { return proj(p[0], p[1], p[2]); }), drawn = false;
        ctx.lineWidth = 1; ctx.strokeStyle = rgba(gold, (dk ? 0.22 : 0.26) * mul); ctx.beginPath();
        pts.forEach(function (p) { if (p[2] > -0.05) { if (drawn) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); drawn = true; } else drawn = false; });
        ctx.stroke();
        if (REDUCE || vi !== leg) return;
        var e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2, head = Math.floor(e * 64), tail = Math.max(0, head - 14);
        ctx.lineWidth = 2;
        for (var j = tail; j < head; j++) { if (pts[j][2] < -0.05) continue; ctx.strokeStyle = rgba(gold, 0.95 * mul * (j - tail) / 14); ctx.beginPath(); ctx.moveTo(pts[j][0], pts[j][1]); ctx.lineTo(pts[j + 1][0], pts[j + 1][1]); ctx.stroke(); }
        if (pts[head][2] > -0.05) { ctx.fillStyle = rgba(gold, mul); ctx.beginPath(); ctx.arc(pts[head][0], pts[head][1], 2.6, 0, 7); ctx.fill(); }
      });
      // cities: a gold mark, a ring as its session opens, and what trades there
      ctx.textBaseline = "middle";
      venues.forEach(function (v, vi) {
        var p = proj(v.p[0], v.p[1], v.p[2]); if (p[2] < 0.05) return;
        var opening = !REDUCE && ((vi === leg && u < 0.35) || (vi === (leg + 1) % n && u > 0.9)), ph = vi === leg ? u / 0.35 : (u - 0.9) / 0.1;
        if (opening) { ctx.strokeStyle = rgba(gold, 0.7 * mul * (1 - ph)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], 4 + ph * 18, 0, 7); ctx.stroke(); }
        ctx.fillStyle = rgba(gold, mul); ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill();
        if (!labels || p[0] < fadeX - 60) return; // keep labels off the copy
        var al = Math.min(1, (p[2] - 0.05) * 4) * dim;
        ctx.font = "500 10px 'IBM Plex Mono', monospace"; ctx.fillStyle = rgba(ink, 0.72 * al); ctx.fillText(v.label, p[0] + 9, p[1] - 6);
        ctx.font = "400 10px 'IBM Plex Mono', monospace"; ctx.fillStyle = rgba(ink, 0.45 * al); ctx.fillText(v.sub, p[0] + 9, p[1] + 7);
      });
    }
    function frame(now) {
      if (!on) return;
      var dt = last ? Math.min(50, now - last) : 16; last = now; t += dt;
      var k = 1 - Math.pow(0.9, dt / 16.7);
      m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k; m.a += (m.ta - m.a) * k * 0.6;
      rotOff += ((W ? (m.x / W - 0.5) * 60 : 0) * m.a - rotOff) * 0.05;
      tiltOff += ((Hh ? (m.y / Hh - 0.5) * 14 : 0) * m.a - tiltOff) * 0.05;
      draw();
      requestAnimationFrame(frame);
    }
    function run() {
      var want = inView && !document.hidden;
      if (want && !on) { on = true; last = 0; requestAnimationFrame(frame); }
      else if (!want) on = false;
    }
    colors(); size();
    if (window.ResizeObserver) { var ro = new ResizeObserver(size); ro.observe(hero); var hc = document.getElementById("heroCard"); if (hc) ro.observe(hc); }
    else window.addEventListener("resize", size);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!on) draw(); });
    new MutationObserver(colors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", colors);
    if (REDUCE) return;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; run(); }).observe(hero);
    document.addEventListener("visibilitychange", run);
    if (FINE) {
      hero.addEventListener("pointermove", function (e) {
        var r = cv.getBoundingClientRect(); m.tx = e.clientX - r.left; m.ty = e.clientY - r.top;
        if (!m.a) { m.x = m.tx; m.y = m.ty; }
        m.ta = 1;
      });
      hero.addEventListener("pointerleave", function () { m.ta = 0; });
    }
    run();
  })();

  /* ---------- pointer effects (mouse and trackpad only) ---------- */
  if (FINE && !REDUCE) {
    // 3D tilt with a soft glare that follows the pointer
    each("[data-tilt]", function (c) {
      var raf = 0, px = 0.5, py = 0.5;
      function apply() {
        raf = 0;
        c.style.setProperty("--ry", ((px - 0.5) * 9).toFixed(2) + "deg");
        c.style.setProperty("--rx", ((0.5 - py) * 7).toFixed(2) + "deg");
        c.style.setProperty("--gx", (px * 100).toFixed(1) + "%");
        c.style.setProperty("--gy", (py * 100).toFixed(1) + "%");
      }
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect(); px = (e.clientX - r.left) / r.width; py = (e.clientY - r.top) / r.height;
        c.classList.add("tilting");
        if (!raf) raf = requestAnimationFrame(apply);
      });
      c.addEventListener("pointerleave", function () { c.classList.remove("tilting"); c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
    });
    // spotlight: a glow that tracks the pointer across a card and its border
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest && e.target.closest(".spot");
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--mx", (e.clientX - r.left).toFixed(0) + "px");
      c.style.setProperty("--my", (e.clientY - r.top).toFixed(0) + "px");
    }, { passive: true });
    // magnetic buttons lean toward the pointer
    each("[data-magnetic]", function (b) {
      b.addEventListener("pointermove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + "px," + ((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1) + "px)";
      });
      b.addEventListener("pointerleave", function () { b.style.transform = ""; });
    });
  }

  /* ---------- FAQ: answers open and close with height, not a jump ---------- */
  each(".faq details", function (det) {
    var sum = det.querySelector("summary"), body = det.querySelector(".faq-a"), anim = null, closing = false;
    if (!sum || !body || !body.animate) return;
    sum.addEventListener("click", function (e) {
      if (REDUCE) return;
      e.preventDefault();
      var from = body.offsetHeight;
      if (anim) anim.cancel();
      if (!det.open || closing) {
        closing = false; det.open = true;
        var to = body.scrollHeight;
        anim = body.animate([{ height: (det.open && from ? from : 0) + "px", opacity: from ? 1 : 0 }, { height: to + "px", opacity: 1 }], { duration: 440, easing: "cubic-bezier(.16,1,.3,1)" });
        anim.onfinish = function () { anim = null; };
      } else {
        closing = true;
        anim = body.animate([{ height: from + "px", opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 320, easing: "cubic-bezier(.65,0,.35,1)" });
        anim.onfinish = function () { det.open = false; closing = false; anim = null; };
      }
    });
  });
})();
