/* =====================================================================
   Man Patel — motion layer
   Rolling numbers, text reveals, the hero rosette, pointer effects
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

  /* ---------- scroll-linked: lede progress + hero background parallax ---------- */
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

  /* ---------- hero: the grand rosette ----------
     A large engraved rosette (fine gold guilloché, as on banknotes and watch
     dials) behind the hero, turning once every six minutes. It is engraved once
     into an offscreen canvas and then only rotated, about 20 times a second.
     Paused off-screen and in background tabs; still under reduced motion. */
  (function heroRosette() {
    var cv = bg, ctx = cv && cv.getContext && cv.getContext("2d");
    if (!ctx) return;
    var hero = cv.closest(".hero") || cv.parentNode;
    var W = 0, Hh = 0, dpr = 1, D = 0, cx = 0, cy = 0, img = null, key = "";
    var gold = [156, 123, 63], dk = false, ang = 0, last = 0, lastDraw = 0, on = false, inView = true;
    var TURN = Math.PI * 2 / 360000; // radians per millisecond: one turn in six minutes
    function hex(s) {
      s = String(s).trim().replace("#", "");
      if (s.length === 3) s = s.replace(/./g, "$&$&");
      var n = parseInt(s, 16);
      return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255];
    }
    function dark() { var a = document.documentElement.getAttribute("data-theme"); return a ? a === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
    function colors() { gold = hex(getComputedStyle(document.documentElement).getPropertyValue("--gold")) || gold; dk = dark(); key = ""; draw(); }
    // the engraving, in a 40-unit box: rims and three lace bands of interlaced lobed rings
    function engrave(px) {
      var c = document.createElement("canvas"); c.width = c.height = px;
      var x = c.getContext("2d"), r = px / 2;
      x.translate(r, r); x.scale(r / 20, r / 20);
      x.strokeStyle = "rgb(" + gold.join(",") + ")";
      function circ(rad, w) { x.beginPath(); x.arc(0, 0, rad, 0, 7); x.lineWidth = w; x.stroke(); }
      function lace(rad, amp, lobes, rings, w) {
        for (var j = 0; j < rings; j++) {
          var ph = j * 2 * Math.PI / rings; x.beginPath();
          for (var k = 0; k <= 1400; k++) { var t = k / 1400 * 2 * Math.PI, rr = rad + amp * Math.sin(lobes * t + ph); if (k) x.lineTo(rr * Math.cos(t), rr * Math.sin(t)); else x.moveTo(rr * Math.cos(t), rr * Math.sin(t)); }
          x.lineWidth = w; x.stroke();
        }
      }
      circ(19.6, 0.07); circ(19.25, 0.035); lace(17.3, 1.45, 36, 6, 0.03); circ(15.45, 0.045);
      lace(13.3, 1.55, 28, 6, 0.03); circ(11.35, 0.045); lace(8.7, 1.85, 20, 8, 0.026); circ(6.25, 0.05);
      return c;
    }
    function size() {
      var r = cv.getBoundingClientRect(); W = r.width; Hh = r.height;
      if (!W || !Hh) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // to the right of the centred headline; on phones, rising from the right edge behind it
      if (W < 640) { D = W * 1.55; cx = W * 0.92; cy = Hh * 0.27; }
      else { D = Math.min(Hh * 1.45, W * 0.95); cx = W * 0.79; cy = Hh * 0.5; }
      draw();
    }
    function draw() {
      if (!W || !D) return;
      // re-engrave only when the size moves to a new step (or the theme changes), never on every resize event
      var px = Math.min(W < 640 ? 1600 : 2048, Math.ceil(D * dpr / 256) * 256), k = px + (dk ? "d" : "l");
      if (!img || key !== k) { img = engrave(px); key = k; }
      ctx.clearRect(0, 0, W, Hh);
      ctx.save(); ctx.globalAlpha = dk ? 0.32 : 0.38; ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.drawImage(img, -D / 2, -D / 2, D, D); ctx.restore();
    }
    function frame(now) {
      if (!on) return;
      var dt = last ? Math.min(100, now - last) : 16; last = now; ang += dt * TURN;
      if (now - lastDraw > 50) { lastDraw = now; draw(); }
      requestAnimationFrame(frame);
    }
    function run() {
      var want = inView && !document.hidden;
      if (want && !on) { on = true; last = 0; requestAnimationFrame(frame); }
      else if (!want) on = false;
    }
    colors(); size();
    if (window.ResizeObserver) new ResizeObserver(size).observe(hero); else window.addEventListener("resize", size);
    new MutationObserver(colors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", colors);
    if (REDUCE) return;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; run(); }).observe(hero);
    document.addEventListener("visibilitychange", run);
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
