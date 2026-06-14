/* =====================================================================
   Man Patel — Systematic Trader
   Data-driven front-end. Loads /data/portfolios.json, renders the
   track record, notes, and wires the contact form to /api/contact.
   ===================================================================== */
(function () {
  "use strict";

  var REDUCE = matchMedia("(prefers-reduced-motion:reduce)").matches;

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  /* =====================================================================
     BOOT — fetch data, then build the app. Falls back to embedded
     defaults if the JSON can't be loaded (e.g. opened via file://).
     ===================================================================== */
  fetch("data/portfolios.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("data " + r.status); return r.json(); })
    .then(init)
    .catch(function () { init(FALLBACK); });

  var FALLBACK = {
    config: { contactEmail: "mptraderx.capital@gmail.com", inceptionDate: "2025-04-28", x: "", linkedin: "" },
    portfolios: [
      { key: "KBAD", strat: "Index breakout", darwinexUrl: "https://www.darwinexzero.com/darwin/KBAD/strategy-analysis", base: 7000, gen: { seed: 7, drift: 0.00092, vol: 0.0072 }, series: [] },
      { key: "WMSN", strat: "Mean reversion", darwinexUrl: "https://www.darwinexzero.com/darwin/WMSN/strategy-analysis", base: 6500, gen: { seed: 10, drift: 0.00066, vol: 0.0085 }, series: [] },
      { key: "ASGU", strat: "Trend / carry", darwinexUrl: "https://www.darwinexzero.com/darwin/ASGU/strategy-analysis", base: 4700, gen: { seed: 7, drift: 0.00046, vol: 0.0055 }, series: [] }
    ],
    notes: []
  };

  function init(CFG) {
    var CONFIG = CFG.config || {};
    var PORTFOLIOS = CFG.portfolios || [];
    var NOTES = CFG.notes || [];
    var META = {};
    PORTFOLIOS.forEach(function (p) { META[p.key] = p; });

    /* ===================== data engine ===================== */
    function mb(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function businessDates(start, end) { var out = [], d = new Date(start); while (d <= end) { var w = d.getDay(); if (w !== 0 && w !== 6) out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; }

    var TODAY = new Date();
    var DATA = {};
    var ANY_REAL = false; // becomes true if any portfolio supplies a real series

    (function build() {
      var refDates = null;
      PORTFOLIOS.forEach(function (p) {
        var dates, eq, real = false;
        if (p.series && p.series.length > 1) {
          dates = p.series.map(function (s) { return new Date(s.d); });
          eq = p.series.map(function (s) { return s.v; });
          real = true; ANY_REAL = true;
        } else {
          dates = businessDates(new Date(CONFIG.inceptionDate || "2025-04-28"), TODAY);
          var g = p.gen || { seed: 1, drift: 0.0008, vol: 0.007 };
          var r = mb(g.seed); eq = [p.base || 5000];
          for (var i = 1; i < dates.length; i++) { var step = gauss(r) * g.vol + g.drift; if (r() < 0.02) step -= g.vol * 1.5; eq.push(eq[i - 1] * (1 + step)); }
        }
        DATA[p.key] = { dates: dates, eq: eq, strat: p.strat, real: real, url: p.darwinexUrl };
        if (!refDates || dates.length < refDates.length) refDates = dates;
      });
      var len = refDates.length, combEq = [];
      for (var i = 0; i < len; i++) { var s = 0; PORTFOLIOS.forEach(function (p) { var e = DATA[p.key].eq; s += e[Math.min(i, e.length - 1)]; }); combEq.push(s); }
      DATA.COMBINED = { dates: refDates.slice(0, len), eq: combEq, strat: "All three books, equal capital", real: ANY_REAL, url: "" };
    })();

    /* ===================== stats ===================== */
    function retsFrom(eq) { var o = []; for (var i = 1; i < eq.length; i++) o.push(eq[i] / eq[i - 1] - 1); return o; }
    function monthly(eq, dates) {
      var last = {}, order = [];
      for (var i = 0; i < eq.length; i++) { var k = dates[i].getFullYear() + "-" + dates[i].getMonth(); if (!(k in last)) order.push(k); last[k] = eq[i]; }
      var vals = order.map(function (k) { return last[k]; }), mr = [];
      for (var j = 1; j < vals.length; j++) mr.push(vals[j] / vals[j - 1] - 1);
      return mr;
    }
    function stats(eq, dates) {
      var rets = retsFrom(eq);
      var tot = eq[eq.length - 1] / eq[0] - 1;
      var peak = eq[0], mdd = 0; for (var i = 0; i < eq.length; i++) { if (eq[i] > peak) peak = eq[i]; var dd = eq[i] / peak - 1; if (dd < mdd) mdd = dd; }
      var m = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1);
      var sd = Math.sqrt(rets.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (rets.length || 1));
      var dn = rets.filter(function (x) { return x < 0; });
      var dsd = Math.sqrt(dn.reduce(function (a, b) { return a + b * b; }, 0) / (dn.length || 1));
      var win = rets.length ? rets.filter(function (x) { return x > 0; }).length / rets.length : 0;
      var mr = monthly(eq, dates);
      var best = mr.length ? Math.max.apply(null, mr) : 0, worst = mr.length ? Math.min.apply(null, mr) : 0;
      return { tot: tot, mdd: mdd, sh: sd ? m / sd * Math.sqrt(252) : 0, so: dsd ? m / dsd * Math.sqrt(252) : 0, vo: sd * Math.sqrt(252), win: win, best: best, worst: worst };
    }

    /* ===================== formatting ===================== */
    var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function fdate(dt) { return dt.getDate() + " " + MO[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); }
    function usd(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
    function pct(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%"; }
    function pctp(v) { return (v * 100).toFixed(1) + "%"; }

    /* ===================== chart ===================== */
    var W0 = 760, H = 230, padT = 12, padB = 10;
    var svg = $("svg"), line = $("line"), area = $("area"),
      cross = $("cross"), dot = $("dot"), tip = $("tip"), grid = $("grid");
    (function drawGrid() { var s = ""; [44, 88, 132, 176].forEach(function (y) { s += '<line x1="0" y1="' + y + '" x2="' + W0 + '" y2="' + y + '"/>'; });[190, 380, 570].forEach(function (x) { s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>'; }); grid.innerHTML = s; })();

    var firstKey = PORTFOLIOS.length ? PORTFOLIOS[0].key : "COMBINED";
    var state = { k: firstKey, t: "ALL" }, cur = { eq: [], dates: [] };
    function px(i, nn) { return (i / (nn - 1)) * W0; }
    function sliceIdx(dates, t) {
      var n = dates.length;
      if (t === "1M") return Math.max(0, n - 21);
      if (t === "3M") return Math.max(0, n - 63);
      if (t === "YTD") { var y = TODAY.getFullYear(); for (var i = 0; i < n; i++) if (dates[i].getFullYear() === y) return i; return 0; }
      return 0;
    }
    function render(animate) {
      var full = DATA[state.k]; var i0 = sliceIdx(full.dates, state.t);
      var eq = full.eq.slice(i0), dates = full.dates.slice(i0); cur = { eq: eq, dates: dates };
      var mn = Math.min.apply(null, eq), mx = Math.max.apply(null, eq), rng = (mx - mn) || 1;
      function py(v) { return padT + (1 - (v - mn) / rng) * (H - padT - padB); }
      var nn = eq.length, pts = []; for (var i = 0; i < nn; i++) pts.push(px(i, nn).toFixed(1) + "," + py(eq[i]).toFixed(1));
      var d = "M" + pts.join(" L"); line.setAttribute("d", d); area.setAttribute("d", d + " L" + W0 + "," + H + " L0," + H + " Z");
      $("d0").textContent = fdate(dates[0]);
      $("d1").textContent = fdate(dates[dates.length - 1]);
      var s = stats(eq, dates);
      $("bVal").textContent = usd(eq[eq.length - 1]);
      var rv = $("bRet"); rv.textContent = pct(s.tot); rv.className = "ret tnum " + (s.tot >= 0 ? "pos" : "neg");
      $("bCtx").textContent = state.t === "ALL" ? "since inception" : "over " + state.t.toLowerCase();
      // strategy line + Darwinex proof link
      var strat = $("trStrat");
      strat.innerHTML = "";
      strat.appendChild(document.createTextNode(full.strat + "  "));
      if (full.url) { var a = el("a"); a.href = full.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "View on Darwinex ↗"; strat.appendChild(a); }
      var rr = $("sRet"); rr.textContent = pct(s.tot); rr.className = "v tnum " + (s.tot >= 0 ? "pos" : "neg");
      $("sDD").textContent = pctp(s.mdd);
      $("sSh").textContent = s.sh.toFixed(2);
      $("sSo").textContent = s.so.toFixed(2);
      $("sVo").textContent = pctp(s.vo);
      $("sBest").textContent = pct(s.best);
      $("sWorst").textContent = pct(s.worst);
      $("sWin").textContent = Math.round(s.win * 100) + "%";
      if (animate && !REDUCE) {
        var L = line.getTotalLength();
        line.style.transition = "none"; line.style.strokeDasharray = L; line.style.strokeDashoffset = L; area.style.opacity = "0";
        line.getBoundingClientRect();
        line.style.transition = "stroke-dashoffset .7s ease"; line.style.strokeDashoffset = "0";
        area.style.transition = "opacity .7s ease"; area.style.opacity = "1";
      }
    }
    function move(e) {
      if (!cur.eq.length) return;
      var r = svg.getBoundingClientRect(); var cx = e.touches ? e.touches[0].clientX : e.clientX;
      var f = (cx - r.left) / r.width; if (f < 0) f = 0; if (f > 1) f = 1;
      var nn = cur.eq.length, idx = Math.round(f * (nn - 1));
      var mn = Math.min.apply(null, cur.eq), mx = Math.max.apply(null, cur.eq), rng = (mx - mn) || 1;
      var x = px(idx, nn), y = padT + (1 - (cur.eq[idx] - mn) / rng) * (H - padT - padB);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.style.opacity = "1";
      dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.style.opacity = "1";
      var ret = cur.eq[idx] / cur.eq[0] - 1;
      tip.innerHTML = fdate(cur.dates[idx]) + " &nbsp;" + usd(cur.eq[idx]) + " &nbsp;" + pct(ret);
      tip.style.left = (f * r.width) + "px"; tip.style.top = "-6px"; tip.style.opacity = "1";
    }
    function leave() { cross.style.opacity = "0"; dot.style.opacity = "0"; tip.style.opacity = "0"; }
    svg.addEventListener("mousemove", move); svg.addEventListener("mouseleave", leave);
    svg.addEventListener("touchstart", move, { passive: true }); svg.addEventListener("touchmove", move, { passive: true }); svg.addEventListener("touchend", leave);

    // build the strategy segmented control from data
    var seg = $("seg"); seg.innerHTML = "";
    PORTFOLIOS.forEach(function (p, i) { var b = el("button"); b.dataset.k = p.key; b.textContent = p.key; if (i === 0) b.className = "on"; seg.appendChild(b); });
    var bc = el("button"); bc.dataset.k = "COMBINED"; bc.textContent = "Combined"; seg.appendChild(bc);
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.k = b.dataset.k;[].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); render(true); });
    $("tf").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.t = b.dataset.t;[].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); render(true); });

    /* data-mode badges: live vs illustrative */
    var liveLabel = $("liveLabel"), dataBadge = $("dataBadge");
    if (ANY_REAL) {
      if (liveLabel) liveLabel.textContent = "live · recorded via Darwinex";
      if (dataBadge) dataBadge.style.display = "none";
    } else {
      if (liveLabel) liveLabel.textContent = "preview · awaiting live feed";
      if (dataBadge) dataBadge.textContent = "illustrative data";
    }

    /* ===================== count-up (used on reveal) ===================== */
    function countUp(elm, target, fmt, dur) {
      if (REDUCE) { elm.textContent = fmt(target); return; }
      var t0 = null;
      function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur); var e = 1 - Math.pow(1 - k, 3); elm.textContent = fmt(target * e); if (k < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }

    /* ===================== hero stats ===================== */
    var c = DATA.COMBINED, hs = stats(c.eq, c.dates), cap = c.eq[c.eq.length - 1];
    $("hReturn").textContent = pct(hs.tot); $("hReturn").classList.add(hs.tot >= 0 ? "pos" : "neg");
    $("hSharpe").textContent = hs.sh.toFixed(2);
    var heroDone = false;
    function heroAnimate() { if (heroDone) return; heroDone = true; countUp($("hCapital"), cap, usd, 1100); }
    // observe hero stats; if already in view, fire now
    var heroStats = document.querySelector(".hero-stats");
    if (heroStats) {
      var ho = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { heroAnimate(); ho.disconnect(); } }); }, { rootMargin: "0px 0px -10% 0px" });
      ho.observe(heroStats);
    } else { heroAnimate(); }

    /* ===================== notes ===================== */
    var listEl = $("notesList");
    function renderNotes(f) {
      listEl.innerHTML = NOTES.filter(function (x) { return f === "all" || x.tag === f; }).map(function (x) {
        return '<div class="note"><span class="nn">' + x.n + '</span><span class="nd">' + x.date + '</span><span class="nt">' + x.title + '</span><span class="ntag">' + x.tag + '</span></div>';
      }).join("") || '<p class="faint" style="padding:18px 0;font-size:14px">No notes yet.</p>';
    }
    renderNotes("all");
    $("notesFilter").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return;[].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); renderNotes(b.dataset.f); });

    /* ===================== contact form -> /api/contact ===================== */
    (function contact() {
      var form = $("enqForm"), btn = $("sendBtn"), statusEl = $("formStatus");
      var fn = $("fn"), fe = $("fe"), fm = $("fm"), hp = $("company");
      if (!form) return;
      var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      function setStatus(msg, kind) { statusEl.textContent = msg; statusEl.className = "form-status show " + (kind || ""); }
      function mark(elm, ok) { elm.classList.toggle("invalid", !ok); }

      function validate() {
        var okN = fn.value.trim().length >= 2;
        var okE = EMAIL.test(fe.value.trim());
        var okM = fm.value.trim().length >= 5;
        mark(fn, okN); mark(fe, okE); mark(fm, okM);
        return okN && okE && okM;
      }
      [fn, fe, fm].forEach(function (i) { i.addEventListener("input", function () { if (i.classList.contains("invalid")) validate(); }); });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (hp && hp.value) return; // bot trap filled -> silently drop
        if (!validate()) { setStatus("Please complete the highlighted fields.", "err"); return; }

        var payload = { name: fn.value.trim(), email: fe.value.trim(), message: fm.value.trim(), company: "" };
        btn.disabled = true;
        var label = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Sending…';

        fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) { return { ok: r.ok, body: body }; });
        }).then(function (res) {
          if (res.ok) {
            form.reset();
            setStatus("Thank you — your enquiry has been sent. I’ll be in touch.", "ok");
          } else {
            throw new Error((res.body && res.body.error) || "send failed");
          }
        }).catch(function () {
          // graceful fallback: open the user's mail client pre-filled
          setStatus("Couldn’t send automatically — opening your email app…", "err");
          var subj = encodeURIComponent("Enquiry via site");
          var body = encodeURIComponent("Name: " + payload.name + "\nEmail: " + payload.email + "\n\n" + payload.message);
          window.location.href = "mailto:" + (CONFIG.contactEmail || "") + "?subject=" + subj + "&body=" + body;
        }).finally(function () {
          btn.disabled = false; btn.textContent = label;
        });
      });
    })();

    /* ===================== nav: scroll state, spy, mobile ===================== */
    var hdr = $("hdr"), links = [].slice.call(document.querySelectorAll(".navlinks a"));
    var progress = $("progress"), totop = $("totop");
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      hdr.classList.toggle("scrolled", y > 10);
      if (progress) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
      }
      if (totop) totop.classList.toggle("show", y > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    if (totop) totop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: REDUCE ? "auto" : "smooth" }); });

    var secs = ["track", "approach", "risk", "notes", "enquiries"].map(function (id) { return $(id); });
    var spy = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { var id = en.target.id; links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + id); }); } }); }, { rootMargin: "-45% 0px -50% 0px" });
    secs.forEach(function (s) { if (s) spy.observe(s); });

    var nl = $("navlinks");
    $("menubtn").addEventListener("click", function () { nl.classList.toggle("open"); });
    nl.addEventListener("click", function (e) { if (e.target.tagName === "A") nl.classList.remove("open"); });

    /* ===================== reveal on scroll (+ stagger) ===================== */
    var rev = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var t = en.target;
        if (t.classList.contains("stagger")) {
          [].forEach.call(t.children, function (child, i) { child.style.transitionDelay = (i * 70) + "ms"; });
        }
        t.classList.add("in");
        rev.unobserve(t);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    [].forEach.call(document.querySelectorAll(".reveal,.stagger"), function (e) { rev.observe(e); });

    /* ===================== footer links / year / social ===================== */
    $("yr").textContent = new Date().getFullYear();
    (function social() {
      var f = $("footLinks");
      if (CONFIG.x) { var a = el("a"); a.href = CONFIG.x; a.textContent = "X"; a.target = "_blank"; a.rel = "noopener"; f.appendChild(a); }
      if (CONFIG.linkedin) { var b = el("a"); b.href = CONFIG.linkedin; b.textContent = "LinkedIn"; b.target = "_blank"; b.rel = "noopener"; f.appendChild(b); }
    })();

    /* first paint */
    render(false);
    requestAnimationFrame(function () { render(true); });
  }
})();
