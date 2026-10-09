/* =====================================================================
   Man Patel — Discretionary Trader
   Data-driven front-end. Loads /data/portfolios.json, swaps in live
   Darwinex data via /api/darwin, renders the track record and notes, and
   wires the contact and subscribe forms. Rolling numbers and tweens come
   from motion.js (window.MP); without it everything still renders.

   Real books supply exact Darwinex `metrics` + `monthly` returns +
   `days` (best/worst). The displayed stats are the exact figures; the
   chart is a daily curve reconstructed to hit every real month-end and
   embed every real best/worst day. Books without `metrics` show a
   clearly-labelled illustrative curve.
   ===================================================================== */
(function () {
  "use strict";

  var REDUCE = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var FINE = matchMedia("(hover:hover) and (pointer:fine)").matches;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function attr(n, o) { for (var k in o) n.setAttribute(k, o[k]); }
  function vis(n, on) { if (n) n.style.opacity = on ? "1" : "0"; }
  // rolling digits when motion.js is loaded, plain text otherwise
  function num(elm, text, opt) { if (!elm) return; if (window.MP && MP.odo) MP.odo(elm, text, opt); else elm.textContent = text; }
  function tween(dur, step, done) {
    if (window.MP && MP.tween && !REDUCE) return MP.tween(dur, MP.ease.inOut, step, done);
    step(1); if (done) done();
    return function () {};
  }
  var FAST = { fast: true };

  fetch("data/portfolios.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("data " + r.status); return r.json(); })
    .catch(function () { return FALLBACK; })
    .then(withLive)
    .then(init);

  var FALLBACK = {
    config: { contactEmail: "mptraderx.capital@gmail.com", currency: "EUR", inceptionDate: "2026-01-09", x: "https://x.com/mptraderx", linkedin: "" },
    portfolios: [
      { key: "KBAD", strat: "Discretionary · multi-asset", darwinexUrl: "https://www.darwinex.com/invest/KBAD", inception: "2026-01-09", live: true, maxDrawdownFloor: -0.0818, gen: { seed: 7, drift: 0.00092, vol: 0.0072 } }
    ],
    notes: []
  };

  /* Swap in live Darwinex data (via /api/darwin) for books marked `live`.
     Never rejects: on error or after 2.5s a book keeps its stored figures. */
  function withLive(CFG) {
    var books = (CFG.portfolios || []).filter(function (p) { return p.live && !p.comingSoon; });
    return Promise.all(books.map(function (p) {
      var ac = window.AbortController ? new AbortController() : null;
      var timer = ac && setTimeout(function () { ac.abort(); }, 2500);
      return fetch("/api/darwin?ticker=" + encodeURIComponent(p.key), ac ? { signal: ac.signal } : {})
        .then(function (r) { if (!r.ok) throw new Error("live " + r.status); return r.json(); })
        .then(function (d) {
          if (!d.series || d.series.length < 2) throw new Error("live: empty series");
          var m = Object.assign({}, d.metrics);
          // Darwinex measures drawdown intraday; never show less than its figure
          if (typeof p.maxDrawdownFloor === "number") m.maxDrawdown = Math.min(m.maxDrawdown, p.maxDrawdownFloor);
          p.series = d.series; p.metrics = m; p.monthly = d.monthly;
          p.inception = d.inception; p.asOf = d.asOf; p.asOfTime = d.asOfTime; p.quote = d.quote; p.liveSynced = true;
          if (d.aum && typeof d.aum.totalEur === "number") { p.aum = d.aum.totalEur; p.aumParts = d.aum; }
          p.activity = d.activity || null; p.allocation = d.allocation || null; p.recognition = d.recognition || null; p.fees = d.fees || null; p.benchmark = d.benchmark || null;
          if (typeof d.cfdLossPct === "number") (CFG.config = CFG.config || {}).cfdLossPct = d.cfdLossPct;
        })
        .catch(function () { /* keep stored figures */ })
        .then(function () { if (timer) clearTimeout(timer); });
    })).then(function () { return CFG; });
  }

  function init(CFG) {
    var CONFIG = CFG.config || {};
    var PORTFOLIOS = CFG.portfolios || [];
    var NOTES = CFG.notes || [];
    var CUR = CONFIG.currency || "EUR";

    /* ===================== helpers ===================== */
    function mb(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function parseISO(s) { var p = String(s).split("-"); return new Date(+p[0], (+p[1]) - 1, +p[2]); } // local, tz-safe
    function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    function mkey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
    function businessDates(start, end) { var out = [], d = new Date(start); while (d <= end) { var w = d.getDay(); if (w !== 0 && w !== 6) out.push(new Date(d)); d.setDate(d.getDate() + 1); } return out; }

    var TODAY = new Date();
    var DATA = {};

    /* ----- reconstruct a daily quote curve (base 100) for a REAL book -----
       Forces each month's compounded return to equal the reported monthly
       return, pins every known best/worst day to its real value, and fills
       the rest with deterministic small noise. Result: month-ends and
       extreme days are exact; the in-between is a faithful reconstruction. */
    function reconstruct(p) {
      var start = parseISO(p.inception);
      var end = p.asOf ? parseISO(p.asOf) : TODAY;
      var dates = businessDates(start, end);
      var n = dates.length;
      var mtarget = {}; (p.monthly || []).forEach(function (o) { mtarget[o.m] = o.r; });
      var known = p.days || {};
      var daily = new Array(n).fill(0); // daily[0] stays 0 (anchor day)
      var byMonth = {};
      for (var i = 1; i < n; i++) { var k = mkey(dates[i]); (byMonth[k] = byMonth[k] || []).push(i); }
      var r = mb(1337);
      Object.keys(byMonth).forEach(function (mk) {
        var idxs = byMonth[mk];
        var target = (mk in mtarget) ? mtarget[mk] : 0;
        var knownLog = 0, unknown = [];
        idxs.forEach(function (i) {
          var ds = iso(dates[i]);
          if (Object.prototype.hasOwnProperty.call(known, ds)) { daily[i] = known[ds]; knownLog += Math.log(1 + known[ds]); }
          else unknown.push(i);
        });
        var U = unknown.length;
        if (U > 0) {
          var need = Math.log(1 + target) - knownLog;
          var ns = unknown.map(function () { return gauss(r) * 0.008; });
          var mean = ns.reduce(function (a, b) { return a + b; }, 0) / U;
          unknown.forEach(function (i, j) { daily[i] = Math.exp(need / U + (ns[j] - mean)) - 1; });
        }
      });
      var eq = [100];
      for (var t = 1; t < n; t++) eq.push(eq[t - 1] * (1 + daily[t]));
      return { dates: dates, eq: eq };
    }

    // real daily closing quotes, as published by Darwinex: [["YYYY-MM-DD", quote], ...]
    function fromSeries(s) { return { dates: s.map(function (x) { return parseISO(x[0]); }), eq: s.map(function (x) { return x[1]; }) }; }

    function synth(p) {
      var dates = businessDates(parseISO(p.inception || CONFIG.inceptionDate || "2026-01-12"), TODAY);
      var g = p.gen || { seed: 1, drift: 0.0008, vol: 0.007 };
      var r = mb(g.seed), eq = [100];
      for (var i = 1; i < dates.length; i++) { var step = gauss(r) * g.vol + g.drift; if (r() < 0.02) step -= g.vol * 1.5; eq.push(eq[i - 1] * (1 + step)); }
      return { dates: dates, eq: eq };
    }
    // running high-water mark, for "from peak" readouts
    function runPeak(eq) { var pk = -Infinity; return eq.map(function (v) { if (v > pk) pk = v; return pk; }); }

    /* ===================== build all books ===================== */
    (function build() {
      var refDates = null;
      PORTFOLIOS.forEach(function (p) {
        if (p.comingSoon) { DATA[p.key] = { comingSoon: true, strat: p.strat, url: p.darwinexUrl || "", real: false }; return; }
        var hasSeries = !!(p.series && p.series.length > 1);
        var real = !!(p.metrics && (hasSeries || p.monthly));
        var c = hasSeries ? fromSeries(p.series) : (real ? reconstruct(p) : synth(p));
        DATA[p.key] = {
          dates: c.dates, eq: c.eq, peak: runPeak(c.eq), strat: p.strat, url: p.darwinexUrl,
          real: real, live: !!p.liveSynced, asOf: p.asOf || null, asOfTime: p.asOfTime || null, metrics: p.metrics || null,
          aum: (typeof p.aum === "number" ? p.aum : null), aumParts: p.aumParts || null,
          inception: p.inception || null,
          monthly: p.monthly || null, activity: p.activity || null, allocation: p.allocation || null, recognition: p.recognition || null, fees: p.fees || null, benchmark: p.benchmark || null
        };
        if (!refDates || c.dates.length < refDates.length) refDates = c.dates;
      });
      var len = refDates.length, combEq = [], keys = PORTFOLIOS.filter(function (p) { return !p.comingSoon; }).map(function (p) { return p.key; });
      for (var i = 0; i < len; i++) {
        var s = 0; keys.forEach(function (k) { var e = DATA[k].eq; s += e[Math.min(i, e.length - 1)]; });
        combEq.push(s / keys.length); // equal-weight blended index, base ~100
      }
      var allReal = keys.every(function (k) { return DATA[k].real; });
      var earliest = null;
      keys.forEach(function (k) { var i = DATA[k].inception; if (i && (!earliest || i < earliest)) earliest = i; });
      DATA.COMBINED = { dates: refDates.slice(0, len), eq: combEq, peak: runPeak(combEq), strat: "All books, equal-weight blend", url: "", real: allReal, combined: true, metrics: null, aum: sumAum(keys), inception: earliest };
    })();

    function sumAum(keys) { var s = 0, any = false; keys.forEach(function (k) { if (DATA[k].aum) { s += DATA[k].aum; any = true; } }); return any ? s : null; }

    /* ===================== stats ===================== */
    function retsFrom(eq) { var o = []; for (var i = 1; i < eq.length; i++) o.push(eq[i] / eq[i - 1] - 1); return o; }
    function monthlyRets(eq, dates) {
      var last = {}, order = [];
      for (var i = 0; i < eq.length; i++) { var k = mkey(dates[i]); if (!(k in last)) order.push(k); last[k] = eq[i]; }
      var vals = order.map(function (k) { return last[k]; }), mr = [];
      for (var j = 1; j < vals.length; j++) mr.push(vals[j] / vals[j - 1] - 1);
      return mr;
    }
    function computeStats(eq, dates) {
      var rets = retsFrom(eq);
      var tot = eq[eq.length - 1] / eq[0] - 1;
      var peak = eq[0], mdd = 0; for (var i = 0; i < eq.length; i++) { if (eq[i] > peak) peak = eq[i]; var dd = eq[i] / peak - 1; if (dd < mdd) mdd = dd; }
      var m = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1);
      var sd = Math.sqrt(rets.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (rets.length || 1));
      var dn = rets.filter(function (x) { return x < 0; });
      var dsd = Math.sqrt(dn.reduce(function (a, b) { return a + b * b; }, 0) / (dn.length || 1));
      var win = rets.length ? rets.filter(function (x) { return x > 0; }).length / rets.length : 0;
      var mr = monthlyRets(eq, dates);
      var best = mr.length ? Math.max.apply(null, mr) : 0, worst = mr.length ? Math.min.apply(null, mr) : 0;
      return { tot: tot, mdd: mdd, sh: sd ? m / sd * Math.sqrt(252) : 0, so: dsd ? m / dsd * Math.sqrt(252) : 0, vo: sd * Math.sqrt(252), win: win, best: best, worst: worst };
    }
    // canonical stats for a book: exact metrics when real, else computed
    function bookStats(key) {
      var d = DATA[key];
      if (d.metrics) {
        var m = d.metrics;
        return { tot: m.return, mdd: m.maxDrawdown, sh: m.sharpe, so: m.sortino, vo: m.volatility, win: m.winRate, best: m.bestMonth, worst: m.worstMonth };
      }
      return computeStats(d.eq, d.dates);
    }

    /* ===================== formatting ===================== */
    var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function fdate(dt) { return dt.getDate() + " " + MO[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); }
    function fday(dt) { return dt.getDate() + " " + MO[dt.getMonth()]; }
    var SYM = { EUR: "€", USD: "$", GBP: "£" };
    function money(v) { return (SYM[CUR] || "") + Math.round(v).toLocaleString("en-US"); }
    function quoteFmt(v) { return v.toFixed(2); }
    function pct(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%"; }
    function pctp(v) { return (v * 100).toFixed(2) + "%"; }
    function daysBetween(a, b) { return Math.round((b - a) / 864e5); }

    // "8 Oct 26, 05:36 PM GMT+5:30" in the visitor's zone; date only without a timestamp
    function whenText(d) {
      var at = d.asOfTime ? new Date(d.asOfTime) : null;
      if (at && !isNaN(at)) return fdate(at) + ", " + at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
      return d.asOf ? fdate(parseISO(d.asOf)) : "";
    }
    function themeNow() { return document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); }

    /* ===================== equity chart =====================
       Drawn at its real pixel size (viewBox = rendered box), so markers stay
       round at any width. Scrub with the pointer, a finger or the arrow keys;
       drag (or use two fingers) to measure between two dates; range changes
       morph from one curve to the next; the line draws in when first seen. */
    var W0 = 760, H = 240, padT = 16, padB = 14, padL = 44, padR = 8;
    var svg = $("svg"), line = $("line"), ghost = $("ghost"), area = $("area"), grid = $("grid"),
      cross = $("cross"), crossH = $("crossH"), dot = $("dot"), head = $("head"), halo = $("halo"),
      endpt = $("endpt"), endring = $("endring"), revealR = $("eqRevealR"), focusR = $("eqFocusR"),
      hband = $("hband"), mband = $("mband"), mA = $("mA"), mB = $("mB"), mLink = $("mLink"),
      tip = $("tip"), mtip = $("mtip"), ypill = $("ypill"), xpill = $("xpill"), ylab = $("ylab"), xaxis = $("xaxis"),
      chartLive = $("chartLive"), hint = $("chartHint");
    var revealed = REDUCE, revealing = false, stopMorph = null, shown = null, axesT = null;

    var firstKey = PORTFOLIOS.length ? PORTFOLIOS[0].key : "COMBINED";
    var state = { k: firstKey, t: "ALL" }, cur = { eq: [], dates: [], g: null };

    function focusAll() { attr(focusR, { x: -20, width: W0 + 40 }); }
    function sizeChart() {
      var w = Math.round(svg.clientWidth), h = Math.round(svg.clientHeight);
      if (w > 0) W0 = w; if (h > 0) H = h;
      padL = W0 < 520 ? 34 : 44;
      svg.setAttribute("viewBox", "0 0 " + W0 + " " + H);
      attr(cross, { y1: 0, y2: H });
      attr(revealR, { y: -20, height: H + 40 }); attr(focusR, { y: -20, height: H + 40 });
      if (!revealing) revealR.setAttribute("width", revealed ? W0 + 20 : 0);
      xpill.style.top = (H + 5) + "px";
      focusAll();
    }
    function xAt(i, n) { return padL + (n > 1 ? i / (n - 1) : 1) * (W0 - padL - padR); }
    function geom(eq, mn, mx) {
      var n = eq.length, xs = [], ys = [], ph = H - padT - padB;
      for (var i = 0; i < n; i++) { xs.push(xAt(i, n)); ys.push(padT + (1 - (eq[i] - mn) / (mx - mn)) * ph); }
      return { xs: xs, ys: ys };
    }
    function pathOf(g) { var s = "", xs = g.xs, ys = g.ys; for (var i = 0; i < xs.length; i++) s += (i ? "L" : "M") + xs[i].toFixed(1) + "," + ys[i].toFixed(1); return s; }
    function paint(g) {
      var d = pathOf(g), n = g.xs.length, lx = g.xs[n - 1], ly = g.ys[n - 1];
      line.setAttribute("d", d); ghost.setAttribute("d", d);
      area.setAttribute("d", d + "L" + lx.toFixed(1) + "," + H + "L" + g.xs[0].toFixed(1) + "," + H + "Z");
      attr(endpt, { cx: lx, cy: ly }); attr(endring, { cx: lx, cy: ly });
      shown = g;
    }
    // the same curve at N evenly spaced x positions, so two ranges can morph point to point
    function resample(g, N) {
      var xs = g.xs, ys = g.ys, n = xs.length, ox = [], oy = [], j = 0;
      for (var k = 0; k < N; k++) {
        var x = xs[0] + (N > 1 ? k / (N - 1) : 0) * (xs[n - 1] - xs[0]);
        while (j < n - 2 && xs[j + 1] < x) j++;
        var span = xs[j + 1] - xs[j], t = span ? Math.max(0, Math.min(1, (x - xs[j]) / span)) : 0;
        ox.push(x); oy.push(n > 1 ? ys[j] + (ys[j + 1] - ys[j]) * t : ys[0]);
      }
      return { xs: ox, ys: oy };
    }
    function yAtX(g, x) {
      var xs = g.xs, lo = 0, hi = xs.length - 1;
      if (x <= xs[0]) return g.ys[0];
      if (x >= xs[hi]) return g.ys[hi];
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
      return g.ys[lo] + (g.ys[hi] - g.ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
    }
    function drawLine(g, morph) {
      if (stopMorph) { stopMorph(); stopMorph = null; }
      if (!(morph && shown && revealed && !REDUCE && window.MP)) { paint(g); return; }
      var N = Math.max(60, Math.round((W0 - padL - padR) / 2)), a = resample(shown, N), b = resample(g, N), ys = new Array(N);
      stopMorph = MP.tween(720, MP.ease.inOut, function (k) {
        for (var i = 0; i < N; i++) ys[i] = a.ys[i] + (b.ys[i] - a.ys[i]) * k;
        paint({ xs: b.xs, ys: ys });
      }, function () { stopMorph = null; paint(g); });
    }

    /* ----- axes: value gridlines on the left, dates along the bottom ----- */
    function niceStep(span, count) {
      var raw = span / count, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), f = raw / mag;
      return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
    }
    function xTicks(dates) {
      var n = dates.length, span = (dates[n - 1] - dates[0]) / 864e5, out = [], lastX = -1e9, gap = W0 < 520 ? 44 : 56;
      for (var i = 1; i < n; i++) {
        var d = dates[i], p = dates[i - 1], take, label = fday(d);
        if (span > 80) { take = d.getMonth() !== p.getMonth(); label = d.getMonth() === 0 ? String(d.getFullYear()) : MO[d.getMonth()]; }
        else if (span > 24) take = d.getDay() < p.getDay() || (d - p) / 864e5 > 3;
        else take = i % 4 === 0;
        var x = xAt(i, n);
        if (!take || x - lastX < gap || x > W0 - padR - 16) continue;
        out.push({ x: x, label: label }); lastX = x;
      }
      return out;
    }
    function drawAxes(mn, mx, dates, morph) {
      var step = niceStep(mx - mn, H < 220 ? 3 : 4), dec = step >= 1 ? 0 : step >= 0.1 ? 1 : 2, ph = H - padT - padB, gl = "", yl = "", xl = "";
      for (var k = Math.ceil(mn / step); k * step <= mx + 1e-9; k++) {
        var v = k * step, y = Math.round(padT + (1 - (v - mn) / (mx - mn)) * ph) + 0.5;
        if (v < mn || y < 6 || y > H - padB) continue;
        gl += '<line x1="' + padL + '" x2="' + (W0 - padR) + '" y1="' + y + '" y2="' + y + '"/>';
        yl += '<span style="top:' + y + "px;width:" + (padL - 8) + 'px">' + v.toFixed(dec) + "</span>";
      }
      xTicks(dates).forEach(function (t) { xl += '<span style="left:' + t.x.toFixed(1) + 'px">' + t.label + "</span>"; });
      function put() { grid.innerHTML = gl; ylab.innerHTML = yl; xaxis.innerHTML = xl; [grid, ylab, xaxis].forEach(function (n) { n.classList.remove("swap"); }); }
      clearTimeout(axesT);
      if (morph && revealed && !REDUCE) { [grid, ylab, xaxis].forEach(function (n) { n.classList.add("swap"); }); axesT = setTimeout(put, 340); }
      else put();
    }

    /* ----- the visible window: a preset range, or one month ("M:2026-03") ----- */
    function isMonth(t) { return t.indexOf("M:") === 0; }
    function sliceIdx(dates, t) {
      var n = dates.length;
      if (t === "1M") return Math.max(0, n - 21);
      if (t === "3M") return Math.max(0, n - 63);
      if (t === "YTD") { var y = TODAY.getFullYear(); for (var i = 0; i < n; i++) if (dates[i].getFullYear() === y) return i; return 0; }
      return 0;
    }
    function windowIdx(dates, t) {
      var n = dates.length;
      if (isMonth(t)) {
        var ym = t.slice(2), a = -1, b = -1;
        for (var i = 0; i < n; i++) if (mkey(dates[i]) === ym) { if (a < 0) a = i; b = i; }
        if (a < 0) return [0, n - 1];
        return [Math.max(0, a - 1), b]; // from the prior close, so the window's return is the month's
      }
      return [sliceIdx(dates, t), n - 1];
    }

    var soonView = $("soonView"), chartboxEl = $("chartbox"), statgridEl = $("statgrid"), bignumEl = document.querySelector(".bignum"), trMetaEl = $("trMeta");
    function monthYear(s) { var d = parseISO(s); return MO[d.getMonth()] + " " + d.getFullYear(); }
    function metaItem(k, v) { return '<span><span class="mk">' + k + '</span><span class="mv">' + v + '</span></span>'; }

    /* ----- headline: the quote and return above the chart ----- */
    var bValEl = $("bVal"), bRetEl = $("bRet"), bCtxEl = $("bCtx");
    function setRet(v, opt) { bRetEl.className = "ret tnum " + (v >= 0 ? "pos" : "neg"); num(bRetEl, pct(v), opt); }
    function ctxLabel() {
      var bits = [];
      if (!cur.full.real && !cur.full.combined) bits.push("illustrative");
      bits.push(isMonth(state.t) ? "in " + MONTHS[+state.t.slice(7) - 1] + " " + state.t.slice(2, 6) : state.t === "ALL" ? "since inception" : "over " + state.t);
      return bits.join(" · ");
    }
    function headline() {
      var eq = cur.eq, n = eq.length;
      num(bValEl, quoteFmt(eq[n - 1])); setRet(eq[n - 1] / eq[0] - 1); bCtxEl.textContent = ctxLabel();
    }

    var f2 = function (v) { return v.toFixed(2); };
    var fwin = function (v) { return (v * 100).toFixed(1) + "%"; };
    var lastMo = null;
    function render(morph) {
      var full = DATA[state.k];

      // coming-soon book: show placeholder, hide the live widgets
      if (full.comingSoon) {
        if (soonView) { soonView.hidden = false; var sk = $("soonKey"); if (sk) sk.textContent = state.k; }
        bignumEl.style.display = "none"; chartboxEl.style.display = "none"; statgridEl.style.display = "none";
        if (trMetaEl) trMetaEl.style.display = "none";
        var strat0 = $("trStrat"); strat0.textContent = full.strat || "New programme";
        $("liveLabel").textContent = "in preparation"; var db = $("dataBadge"); db.style.display = ""; db.textContent = "coming soon";
        renderMonthly(null); lastMo = null;
        return;
      }
      if (soonView) soonView.hidden = true;
      bignumEl.style.display = ""; chartboxEl.style.display = ""; statgridEl.style.display = ""; if (trMetaEl) trMetaEl.style.display = "";
      sizeChart();

      var w = windowIdx(full.dates, state.t), i0 = w[0], i1 = w[1];
      var eq = full.eq.slice(i0, i1 + 1), dates = full.dates.slice(i0, i1 + 1);
      var mn = Math.min.apply(null, eq), mx = Math.max.apply(null, eq), pad = (mx - mn) * 0.12 || 0.5;
      mn -= pad; mx += pad;
      clearMeasure();
      cur = { eq: eq, dates: dates, i0: i0, full: full };
      cur.g = geom(eq, mn, mx);
      drawLine(cur.g, morph);
      drawAxes(mn, mx, dates, morph);
      hideScrub();
      headline();

      // per-ticker meta row: AUM · Inception · Annualised
      if (trMetaEl) {
        var mh = "";
        if (full.aum === 0) mh += metaItem("AUM", "No allocation yet");
        else if (full.aum) mh += metaItem(full.combined ? "AUM · all books" : "AUM", money(full.aum));
        var ap = full.aumParts;
        if (ap) {
          if (ap.darwinexCapitalEur) mh += metaItem("Darwinex capital", money(ap.darwinexCapitalEur));
          if (ap.investorsUsd) mh += metaItem("Investors", "$" + Math.round(ap.investorsUsd).toLocaleString("en-US") + " · " + ap.investors);
        }
        if (full.inception) mh += metaItem("Inception", monthYear(full.inception));
        if (full.metrics && typeof full.metrics.annReturn === "number") mh += metaItem("Annualised", pct(full.metrics.annReturn));
        trMetaEl.innerHTML = mh;
      }

      // strategy line + Darwinex proof link
      var strat = $("trStrat"); strat.innerHTML = "";
      strat.appendChild(document.createTextNode(full.strat + "  "));
      if (full.url) { var a = el("a"); a.href = full.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "View on Darwinex ↗"; strat.appendChild(a); }
      if (full.real && !full.combined) { strat.appendChild(document.createTextNode("  ·  ")); var sheet = el("a"); sheet.href = "/factsheet"; sheet.target = "_blank"; sheet.rel = "noopener"; sheet.textContent = "Factsheet (PDF) ↗"; strat.appendChild(sheet); }

      // stat grid: canonical full-period stats (exact for real books)
      var s = bookStats(state.k);
      var rr = $("sRet"); rr.className = "v tnum " + (s.tot >= 0 ? "pos" : "neg"); num(rr, pct(s.tot));
      num($("sDD"), pctp(s.mdd));
      num($("sSh"), f2(s.sh));
      num($("sSo"), f2(s.so));
      num($("sVo"), pctp(s.vo));
      num($("sBest"), pct(s.best));
      num($("sWorst"), pct(s.worst));
      num($("sWin"), fwin(s.win));

      // badges
      var liveLabel = $("liveLabel"), dataBadge = $("dataBadge");
      if (full.combined) { liveLabel.textContent = "equal-weight blend of live books"; dataBadge.style.display = ""; dataBadge.textContent = "blended"; }
      else if (full.real) {
        var asOf = whenText(full);
        liveLabel.textContent = full.live ? "live · Darwinex · updated " + asOf : "recorded via Darwinex" + (asOf ? " · as of " + asOf : "");
        dataBadge.style.display = "none";
      }
      else { liveLabel.textContent = "preview · illustrative"; dataBadge.style.display = ""; dataBadge.textContent = "illustrative data"; }

      if (lastMo !== state.k) { renderMonthly(full); lastMo = state.k; }
      markMonth();
    }

    /* ----- scrubbing ----- */
    function hideScrub() { [cross, crossH, dot, tip, ypill, xpill].forEach(function (n) { vis(n, 0); }); focusAll(); }
    function scrubAt(i) {
      var g = cur.g; if (!g) return;
      var x = g.xs[i], y = g.ys[i], q = cur.eq[i], at = cur.i0 + i, full = cur.full;
      attr(cross, { x1: x, x2: x }); attr(crossH, { x1: padL, x2: W0 - padR, y1: y, y2: y }); attr(dot, { cx: x, cy: y });
      vis(cross, 1); vis(crossH, 1); vis(dot, 1);
      attr(focusR, { x: -20, width: x + 20 }); // the line ahead of the cursor fades back
      ypill.textContent = quoteFmt(q); ypill.style.transform = "translate(0," + y.toFixed(1) + "px) translateY(-50%)"; vis(ypill, 1);
      xpill.textContent = fdate(cur.dates[i]); xpill.style.left = x.toFixed(1) + "px"; vis(xpill, 1);
      var day = at > 0 ? q / full.eq[at - 1] - 1 : 0, fromPk = q / full.peak[at] - 1;
      tip.innerHTML = '<span class="tk">Day</span><span class="' + (day >= 0 ? "pos" : "neg") + '">' + pct(day) + '</span><span class="tk">From peak</span><span>' + (fromPk < -5e-5 ? pctp(fromPk) : "at a high") + "</span>";
      var tw = tip.offsetWidth, th = tip.offsetHeight, tx = x + 16, ty = y - th - 14;
      if (tx + tw > W0 - 2) tx = x - 16 - tw;
      if (ty < -8) ty = y + 14;
      tip.style.transform = "translate(" + tx.toFixed(0) + "px," + ty.toFixed(0) + "px)"; vis(tip, 1);
      num(bValEl, quoteFmt(q), FAST); setRet(q / cur.eq[0] - 1, FAST);
      bCtxEl.textContent = fdate(cur.dates[0]) + " → " + fdate(cur.dates[i]);
    }
    function leave() { hideScrub(); if (cur.g) headline(); }

    /* ----- measuring between two dates ----- */
    var measure = null;
    function showMeasure(a, b) {
      var i = Math.min(a, b), j = Math.max(a, b), g = cur.g;
      if (!g || i === j) return;
      measure = { a: i, b: j };
      var xa = g.xs[i], xb = g.xs[j], ya = g.ys[i], yb = g.ys[j], r = cur.eq[j] / cur.eq[i] - 1, days = daysBetween(cur.dates[i], cur.dates[j]);
      [cross, crossH, dot, tip, ypill].forEach(function (n) { vis(n, 0); });
      attr(mband, { x: xa, y: 0, width: xb - xa, height: H, "class": "mband " + (r >= 0 ? "up" : "down") });
      attr(mA, { cx: xa, cy: ya }); attr(mB, { cx: xb, cy: yb }); attr(mLink, { x1: xa, y1: ya, x2: xb, y2: yb });
      [mband, mA, mB, mLink].forEach(function (n) { vis(n, 1); });
      attr(focusR, { x: xa, width: xb - xa }); // only the measured stretch stays in full colour
      mtip.innerHTML = '<b class="' + (r >= 0 ? "pos" : "neg") + '">' + pct(r) + "</b><span>" + days + (days === 1 ? " day" : " days") + "</span>";
      var mxp = Math.max(64, Math.min(W0 - 64, (xa + xb) / 2)), myp = Math.max(Math.min(ya, yb) - 14, 40);
      mtip.style.transform = "translate(" + mxp.toFixed(0) + "px," + myp.toFixed(0) + "px) translate(-50%,-100%)"; vis(mtip, 1);
      xpill.textContent = fdate(cur.dates[j]); xpill.style.left = xb.toFixed(1) + "px"; vis(xpill, 1);
      num(bValEl, quoteFmt(cur.eq[j]), FAST); setRet(r, FAST);
      bCtxEl.textContent = fdate(cur.dates[i]) + " → " + fdate(cur.dates[j]);
    }
    function clearMeasure() {
      if (!measure) return;
      measure = null;
      [mband, mA, mB, mLink, mtip, xpill].forEach(function (n) { vis(n, 0); });
      focusAll();
    }
    function usedMeasure() { if (hint) hint.classList.add("gone"); try { localStorage.setItem("mp-measure", "1"); } catch (_) { /* fine */ } }
    (function chartHint() {
      var done = false; try { done = localStorage.getItem("mp-measure") === "1"; } catch (_) { /* fine */ }
      if (hint && !done) hint.textContent = FINE ? "Drag across the chart to measure" : "Two fingers to measure";
    })();

    /* ----- pointer, touch and keyboard ----- */
    var ptrs = {}, drag = null;
    function nPtr() { return Object.keys(ptrs).length; }
    function idxAt(clientX) {
      var r = svg.getBoundingClientRect(), x = (clientX - r.left) * (W0 / (r.width || W0)), n = cur.eq.length;
      return Math.max(0, Math.min(n - 1, Math.round((x - padL) / (W0 - padL - padR) * (n - 1))));
    }
    function touchPair() { var k = Object.keys(ptrs); showMeasure(idxAt(ptrs[k[0]]), idxAt(ptrs[k[1]])); }
    svg.addEventListener("pointerdown", function (e) {
      if (!cur.g) return;
      ptrs[e.pointerId] = e.clientX;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        clearMeasure(); drag = { a: idxAt(e.clientX), moved: false };
        try { svg.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
      } else if (nPtr() >= 2) touchPair();
      else { clearMeasure(); scrubAt(idxAt(e.clientX)); }
    });
    svg.addEventListener("pointermove", function (e) {
      if (!cur.g) return;
      var i = idxAt(e.clientX);
      if (e.pointerType === "mouse") {
        if (drag) { if (i !== drag.a) drag.moved = true; if (drag.moved) { showMeasure(drag.a, i); return; } }
        if (!measure) scrubAt(i);
      } else if (e.pointerId in ptrs) {
        ptrs[e.pointerId] = e.clientX;
        if (nPtr() >= 2) touchPair(); else if (!measure) scrubAt(i);
      }
    });
    function lift(e) {
      var pair = nPtr() >= 2;
      delete ptrs[e.pointerId];
      if (e.pointerType === "mouse") {
        if (drag && drag.moved && measure) usedMeasure();
        else if (drag && e.type === "pointerup") scrubAt(idxAt(e.clientX));
        drag = null; return;
      }
      if (pair && measure) usedMeasure(); // the measurement stays up after the fingers lift
      else if (!nPtr() && !measure) leave();
    }
    svg.addEventListener("pointerup", lift);
    svg.addEventListener("pointercancel", lift);
    svg.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse" && !drag) { clearMeasure(); leave(); } });
    var kIdx = 0;
    function say(i) { if (chartLive) chartLive.textContent = fdate(cur.dates[i]) + ": " + quoteFmt(cur.eq[i]) + ", " + pct(cur.eq[i] / cur.eq[0] - 1); }
    svg.addEventListener("focus", function () {
      var kb = true; try { kb = svg.matches(":focus-visible"); } catch (_) { /* older browsers */ }
      if (!kb || !cur.g) return;
      kIdx = cur.eq.length - 1; scrubAt(kIdx); say(kIdx);
    });
    svg.addEventListener("blur", function () { clearMeasure(); leave(); });
    svg.addEventListener("keydown", function (e) {
      if (!cur.g) return;
      var n = cur.eq.length, s = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft") kIdx = Math.max(0, kIdx - s);
      else if (e.key === "ArrowRight") kIdx = Math.min(n - 1, kIdx + s);
      else if (e.key === "Home") kIdx = 0;
      else if (e.key === "End") kIdx = n - 1;
      else if (e.key === "Escape") { svg.blur(); return; }
      else return;
      e.preventDefault(); scrubAt(kIdx); say(kIdx);
    });

    /* ----- first view: the line draws itself in, led by a glowing point ----- */
    function revealChart() {
      if (revealed || !cur.g) return;
      revealed = true;
      if (REDUCE || !window.MP) { revealR.setAttribute("width", W0 + 20); svg.classList.add("done"); return; }
      revealing = true; vis(head, 1); vis(halo, 1);
      MP.tween(1700, MP.ease.inOut, function (k) {
        var x = padL + k * (W0 - padL - padR), y = yAtX(shown || cur.g, x);
        revealR.setAttribute("width", x);
        attr(head, { cx: x, cy: y }); attr(halo, { cx: x, cy: y });
      }, function () { revealing = false; revealR.setAttribute("width", W0 + 20); vis(head, 0); vis(halo, 0); svg.classList.add("done"); });
    }
    if (REDUCE) svg.classList.add("done");
    else if ("IntersectionObserver" in window) {
      var cio = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { cio.disconnect(); setTimeout(revealChart, 260); } }, { threshold: 0.35 });
      cio.observe(chartboxEl);
    } else { revealed = true; svg.classList.add("done"); }

    /* ----- range controls ----- */
    var seg = $("seg"); seg.innerHTML = "";
    PORTFOLIOS.forEach(function (p, i) {
      var b = el("button"); b.dataset.k = p.key; b.textContent = p.key;
      if (p.comingSoon) { b.classList.add("soon"); b.setAttribute("data-soon", "Coming soon"); b.setAttribute("title", "Coming soon"); }
      if (i === 0) b.classList.add("on");
      seg.appendChild(b);
    });
    // a blend only means something with 2+ live books
    if (PORTFOLIOS.filter(function (p) { return !p.comingSoon; }).length > 1) {
      var bc = el("button"); bc.dataset.k = "COMBINED"; bc.textContent = "Combined"; seg.appendChild(bc);
    }
    seg.classList.toggle("single", seg.children.length === 1); // nothing to switch to: render as a label
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      state.k = b.dataset.k; if (isMonth(state.t)) state.t = "ALL";
      [].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); });
      setTf(state.t);
    });
    var tfChip = $("tfChip");
    function setTf(t) {
      state.t = t;
      [].forEach.call($("tf").querySelectorAll("button[data-t]"), function (x) { x.classList.toggle("on", x.dataset.t === t); });
      if (tfChip) {
        tfChip.hidden = !isMonth(t);
        if (isMonth(t)) { tfChip.innerHTML = MO[+t.slice(7) - 1] + " " + t.slice(2, 6) + ' <span aria-hidden="true">&times;</span>'; tfChip.setAttribute("aria-label", "Showing " + MONTHS[+t.slice(7) - 1] + " " + t.slice(2, 6) + ". Back to all"); }
      }
      render(true);
    }
    $("tf").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      setTf(b === tfChip ? "ALL" : b.dataset.t);
    });

    /* ===================== monthly returns heatmap =====================
       Hover a month for its daily path; click it to zoom the chart to it. */
    var moWrap = $("monthly"), moBody = $("moBody"), moPop = $("moPop");
    function renderMonthly(d) {
      if (!moWrap) return;
      var m = d && d.monthly;
      if (!m || !m.length) { moWrap.hidden = true; return; }
      var byYear = {};
      m.forEach(function (o) { (byYear[o.m.slice(0, 4)] = byYear[o.m.slice(0, 4)] || {})[+o.m.slice(5, 7) - 1] = o.r; });
      moBody.innerHTML = Object.keys(byYear).sort().map(function (y) {
        var row = byYear[y], tot = 1, cells = "";
        for (var i = 0; i < 12; i++) {
          if (!(i in row)) { cells += '<div class="mo-cell empty" style="--k:' + i + '" role="listitem" aria-label="' + MONTHS[i] + " " + y + ': no data"><span class="mo-m">' + MO[i] + '</span><span class="mo-v">&ndash;</span></div>'; continue; }
          var r = row[i], label = MONTHS[i] + " " + y + ": " + pct(r);
          tot *= 1 + r;
          // diverging: hue = sign, depth = size (capped at 10%); the signed value carries it too
          var a = (0.10 + 0.45 * Math.min(Math.abs(r) / 0.10, 1)).toFixed(3);
          cells += '<div class="mo-cell ' + (r > 0 ? "up" : r < 0 ? "down" : "") + '" style="--a:' + a + ";--k:" + i + '" data-ym="' + y + "-" + String(i + 1).padStart(2, "0") + '" role="listitem" tabindex="0" aria-label="' + label + '"><span class="mo-m">' + MO[i] + '</span><span class="mo-v">' + pct(r) + "</span></div>";
        }
        tot -= 1;
        return '<div class="mo-row"><div class="mo-year"><span class="mo-y">' + y + '</span><span class="mo-tot ' + (tot >= 0 ? "pos" : "neg") + '">' + pct(tot) + '</span></div><div class="mo-grid" role="list" aria-label="Monthly returns ' + y + '">' + cells + "</div></div>";
      }).join("");
      moWrap.classList.toggle("live", !!d.live);
      moWrap.hidden = false;
    }
    function markMonth() {
      var ym = isMonth(state.t) ? state.t.slice(2) : null;
      [].forEach.call(moBody.querySelectorAll(".mo-cell[data-ym]"), function (c) { c.classList.toggle("sel", c.dataset.ym === ym); });
    }
    function monthSpan(dates, ym) { var a = -1, b = -1; for (var i = 0; i < dates.length; i++) if (mkey(dates[i]) === ym) { if (a < 0) a = i; b = i; } return a < 0 ? null : [a, b]; }
    // the month shaded on the main chart while its cell is hovered
    function chartBand(ym) {
      var s = ym && cur.g && monthSpan(cur.dates, ym);
      if (!s) { vis(hband, 0); return; }
      var xa = cur.g.xs[Math.max(0, s[0] - 1)], xb = cur.g.xs[s[1]];
      attr(hband, { x: xa, y: 0, width: Math.max(2, xb - xa), height: H }); vis(hband, 1);
    }
    function showPop(cell) {
      var d = DATA[state.k], ym = cell.dataset.ym, sp = d && d.live && ym && monthSpan(d.dates, ym);
      if (!sp || !moPop) { hidePop(); return; }
      var a = Math.max(0, sp[0] - 1), b = sp[1], best = null, worst = null;
      for (var j = Math.max(1, sp[0]); j <= b; j++) { var dr = d.eq[j] / d.eq[j - 1] - 1; if (!best || dr > best.r) best = { r: dr, i: j }; if (!worst || dr < worst.r) worst = { r: dr, i: j }; }
      var mo = (d.monthly || []).filter(function (o) { return o.m === ym; })[0], r = mo ? mo.r : d.eq[b] / d.eq[a] - 1;
      var seg = d.eq.slice(a, b + 1), w = 200, h = 46, lo = Math.min.apply(null, seg), hi = Math.max.apply(null, seg), rg = (hi - lo) || 1;
      function Y(v) { return (4 + (1 - (v - lo) / rg) * (h - 8)).toFixed(1); }
      var P = seg.map(function (v, i) { return (2 + i / ((seg.length - 1) || 1) * (w - 4)).toFixed(1) + "," + Y(v); });
      moPop.innerHTML = '<div class="mp-h"><span>' + MONTHS[+ym.slice(5) - 1] + " " + ym.slice(0, 4) + '</span><b class="' + (r >= 0 ? "pos" : "neg") + '">' + pct(r) + "</b></div>" +
        '<svg class="mp-s" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><line x1="0" x2="' + w + '" y1="' + Y(seg[0]) + '" y2="' + Y(seg[0]) + '"/><path class="' + (r >= 0 ? "up" : "down") + '" d="M' + P.join("L") + '"/></svg>' +
        (best ? '<div class="mp-r"><span>Best day</span><span>' + pct(best.r) + " · " + fday(d.dates[best.i]) + "</span></div>" : "") +
        (worst ? '<div class="mp-r"><span>Worst day</span><span>' + pct(worst.r) + " · " + fday(d.dates[worst.i]) + "</span></div>" : "") +
        '<div class="mp-r"><span>Sessions</span><span>' + (sp[1] - sp[0] + 1) + "</span></div>";
      moPop.hidden = false;
      var wr = moWrap.getBoundingClientRect(), cr = cell.getBoundingClientRect(), pw = moPop.offsetWidth, ph = moPop.offsetHeight;
      moPop.style.left = Math.max(0, Math.min(wr.width - pw, cr.left - wr.left + cr.width / 2 - pw / 2)).toFixed(0) + "px";
      moPop.style.top = (cr.top - wr.top - ph - 10).toFixed(0) + "px";
      requestAnimationFrame(function () { moPop.classList.add("show"); });
      chartBand(ym);
    }
    function hidePop() { if (moPop) { moPop.classList.remove("show"); moPop.hidden = true; } chartBand(null); }
    function zoomMonth(ym) {
      if (!DATA[state.k].live) return;
      hidePop();
      setTf(state.t === "M:" + ym ? "ALL" : "M:" + ym);
      var c = document.querySelector("#track .controls"), r = c && c.getBoundingClientRect();
      if (r && (r.top < 70 || chartboxEl.getBoundingClientRect().bottom > window.innerHeight)) window.scrollTo({ top: (window.scrollY || window.pageYOffset) + r.top - 96, behavior: REDUCE ? "auto" : "smooth" });
    }
    if (moBody) {
      var popCell = null;
      moBody.addEventListener("mouseover", function (e) { if (!FINE) return; var c = e.target.closest(".mo-cell"); if (c && c !== popCell) { popCell = c; showPop(c); } });
      moBody.addEventListener("mouseleave", function () { popCell = null; hidePop(); });
      moBody.addEventListener("focusin", function (e) { var c = e.target.closest(".mo-cell[data-ym]"); if (c) showPop(c); });
      moBody.addEventListener("focusout", hidePop);
      moBody.addEventListener("click", function (e) { var c = e.target.closest(".mo-cell[data-ym]"); if (c) zoomMonth(c.dataset.ym); });
      moBody.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var c = e.target.closest(".mo-cell[data-ym]"); if (c) { e.preventDefault(); zoomMonth(c.dataset.ym); }
      });
    }

    /* ===================== hero live card (stat tile) ===================== */
    var HK = PORTFOLIOS.filter(function (p) { return !p.comingSoon; }).map(function (p) { return p.key; })[0];
    var heroCard = $("heroCard"), hcSpark = $("hcSpark"), hc = { revealed: REDUCE, revealing: false };
    function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    // the card at rest: latest quote, the last session's move, when it updated
    function hcRest() {
      var d = hc.d, eq = d.eq, n = eq.length, last = eq[n - 1], prev = eq[n - 2], ch = last - prev;
      num($("hcQuote"), quoteFmt(last), { from: quoteFmt(eq[0]) });
      var at = d.asOfTime ? new Date(d.asOfTime) : d.dates[n - 1], delta = $("hcDelta");
      if (d.live) { // real daily quotes: the last session's move
        delta.className = "hc-delta " + (ch >= 0 ? "pos" : "neg");
        delta.innerHTML = (ch >= 0 ? "+" : "-") + Math.abs(ch).toFixed(2) + " (" + pct(last / prev - 1) + ')<span class="when">' + (sameDay(at, new Date()) ? "today" : "on " + fdate(at)) + "</span>";
      } else { // stored snapshot: its daily curve is reconstructed, so only quote the real total
        var tot = d.metrics ? d.metrics.return : last / eq[0] - 1;
        delta.className = "hc-delta " + (tot >= 0 ? "pos" : "neg");
        delta.innerHTML = pct(tot) + '<span class="when">since inception</span>';
      }
      $("hcFoot").textContent = "Updated " + whenText(d);
      vis($("hcCross"), 0);
    }
    function hcYAt(f) { var eq = hc.d.eq, i = Math.floor(f), j = Math.min(eq.length - 1, i + 1); return hc.Y(eq[i] + (eq[j] - eq[i]) * (f - i)); }
    function drawHeroCard() {
      var d = HK && DATA[HK];
      if (!heroCard || !d || !d.real || d.eq.length < 2) return;
      heroCard.hidden = false;
      var eq = d.eq, n = eq.length;
      hc.d = d;
      $("hcTicker").textContent = HK;
      $("hcLive").textContent = d.live ? "live" : "snapshot";
      if (!hc.revealing) hcRest();
      if (d.url) $("hcLink").href = d.url;
      // sparkline at real pixel size
      var w = Math.round(hcSpark.clientWidth) || 296, h = Math.round(hcSpark.clientHeight) || 70, pad = 6;
      hcSpark.setAttribute("viewBox", "0 0 " + w + " " + h);
      var mn = Math.min.apply(null, eq), mx = Math.max.apply(null, eq), rg = (mx - mn) || 1;
      hc.w = w;
      hc.X = function (i) { return pad + (i / (n - 1)) * (w - pad * 2); };
      hc.Y = function (v) { return pad + (1 - (v - mn) / rg) * (h - pad * 2); };
      var path = "M" + eq.map(function (v, i) { return hc.X(i).toFixed(1) + "," + hc.Y(v).toFixed(1); }).join("L");
      $("hcLine").setAttribute("d", path);
      $("hcArea").setAttribute("d", path + "L" + hc.X(n - 1).toFixed(1) + "," + h + "L" + hc.X(0).toFixed(1) + "," + h + "Z");
      attr($("hcClipR"), { y: -10, height: h + 20 }); attr($("hcCross"), { y1: 0, y2: h });
      if (!hc.revealing) { $("hcClipR").setAttribute("width", hc.revealed ? w + 20 : 0); hcDotAt(n - 1); }
      if (!hc.revealed) {
        hc.revealed = true; hc.revealing = true; vis($("hcDot"), 0);
        setTimeout(function () {
          vis($("hcDot"), 1);
          tween(1600, function (k) {
            var x = pad + k * (hc.w - pad * 2);
            $("hcClipR").setAttribute("width", x);
            attr($("hcDot"), { cx: x, cy: hcYAt(k * (hc.d.eq.length - 1)) });
          }, function () { hc.revealing = false; $("hcClipR").setAttribute("width", hc.w + 20); hcDotAt(hc.d.eq.length - 1); });
        }, 650);
      }
    }
    function hcDotAt(i) { attr($("hcDot"), { cx: hc.X(i), cy: hc.Y(hc.d.eq[i]) }); }
    if (hcSpark) {
      hcSpark.addEventListener("pointermove", function (e) {
        if (!hc.d || hc.revealing) return;
        var r = hcSpark.getBoundingClientRect(), n = hc.d.eq.length;
        var i = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (n - 1));
        var q = hc.d.eq[i], tot = q / hc.d.eq[0] - 1, delta = $("hcDelta");
        hcDotAt(i); attr($("hcCross"), { x1: hc.X(i), x2: hc.X(i) }); vis($("hcCross"), 1);
        num($("hcQuote"), quoteFmt(q), FAST);
        delta.className = "hc-delta " + (tot >= 0 ? "pos" : "neg");
        delta.innerHTML = pct(tot) + '<span class="when">since inception</span>';
        $("hcFoot").textContent = fdate(hc.d.dates[i]);
      });
      hcSpark.addEventListener("pointerleave", function () { if (!hc.d || hc.revealing) return; hcDotAt(hc.d.eq.length - 1); hcRest(); });
    }

    /* ===================== trading activity + asset mix ===================== */
    var INSTR = { NI225: "Nikkei 225", XAGUSD: "Silver", XTIUSD: "WTI crude oil", XBRUSD: "Brent crude", NDX: "Nasdaq 100", NDXm: "Nasdaq 100", XAUUSD: "Gold", MSTR: "Strategy (MSTR)", GDAXI: "DAX 40", GDAXIm: "DAX 40", EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", SPX500: "S&P 500", SP500: "S&P 500", WS30: "Dow Jones", US30: "Dow Jones" };
    function iname(t) { return INSTR[t] || t; }
    function fmtDur(s) { return String(s).replace(/(\d+)([DHMS])/g, function (_, n, u) { return n + u.toLowerCase() + " "; }).trim(); }
    function mixRow(name, sub, p, max, other, i) {
      return '<li class="mix-row' + (other ? " other" : "") + '" style="--i:' + i + '" title="' + esc(name) + ": " + (p * 100).toFixed(1) + '%"><span class="mix-name">' + esc(name) + (sub ? "<small>" + esc(sub) + "</small>" : "") +
        '</span><span class="mix-track"><span class="mix-bar" style="width:' + (p / max * 100).toFixed(1) + '%"></span></span><span class="mix-val">' + (p * 100).toFixed(1) + "%</span></li>";
    }
    function renderExtra() {
      var d = HK && DATA[HK], wrap = $("trExtra");
      if (!wrap || !d) return;
      var act = d.activity, mix = d.allocation, any = renderDrawdowns(d);
      if (act && (act.trades != null || act.avgDuration || act.winningTrades != null)) {
        num($("aTrades"), act.trades != null ? act.trades.toLocaleString("en-US") : "—");
        num($("aDur"), act.avgDuration ? fmtDur(act.avgDuration) : "—");
        num($("aWin"), act.winningTrades != null ? (act.winningTrades * 100).toFixed(1) + "%" : "—");
        $("activityCard").hidden = false; any = true;
      }
      // market link: correlation and beta only — S&P's terms forbid showing the index itself
      var bm = d.live && d.benchmark;
      if (bm && typeof bm.correlation === "number") {
        num($("mCorr"), bm.correlation.toFixed(2));
        num($("mBeta"), bm.beta.toFixed(2));
        num($("mDays"), String(bm.days));
        var c = Math.max(-1, Math.min(1, bm.correlation)), at = (c + 1) * 50, cs = $("corrScale");
        if (cs) { cs.style.setProperty("--c", at.toFixed(1) + "%"); cs.style.setProperty("--fl", Math.min(50, at).toFixed(1) + "%"); cs.style.setProperty("--fw", Math.abs(at - 50).toFixed(1) + "%"); }
        $("mktBlock").hidden = false; $("mNote").hidden = false;
      }
      if (mix && mix.length) {
        // part-to-whole reads at a glance up to ~5 rows; fold the tail into "Other"
        var top = mix.length > 5 ? mix.slice(0, 4) : mix, rest = mix.length > 5 ? mix.slice(4) : [];
        var max = Math.max.apply(null, mix.map(function (x) { return x.pct; }));
        var html = top.map(function (x, i) { return mixRow(iname(x.name), "", x.pct, max, false, i); }).join("");
        // non-breaking spaces keep each name whole when the list wraps ("DAX 40", not "DAX / 40")
        if (rest.length) html += mixRow("Other", rest.map(function (x) { return iname(x.name).replace(/ /g, " "); }).join(", "), rest.reduce(function (s, x) { return s + x.pct; }, 0), max, true, top.length);
        $("mixList").innerHTML = html; $("mixCard").hidden = false; any = true;
        [].forEach.call($("mixList").querySelectorAll(".mix-val"), function (v) { num(v, v.textContent); });
      }
      wrap.hidden = !any;
      drawDrawdown(); // measure only now: while the block was hidden its width read as 0
      if (dd.uw && !dd.watch) {
        dd.watch = true;
        if ("IntersectionObserver" in window && !REDUCE) {
          var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); setTimeout(revealDD, 200); } }, { threshold: 0.5 });
          io.observe(ddSvg);
        } else revealDD();
      }
    }

    /* ===================== drawdowns (real daily quotes only) =====================
       The underwater curve, its five deepest periods, and both linked:
       hover a period on the curve or in the table to see it on the other. */
    // Each period runs from a peak until the quote regains it; one still open is "ongoing".
    function drawdownPeriods(eq) {
      var out = [], peak = eq[0], peakI = 0, cur = null;
      for (var i = 1; i < eq.length; i++) {
        if (eq[i] >= peak) {
          if (cur) { cur.recI = i; out.push(cur); cur = null; }
          peak = eq[i]; peakI = i;
        } else {
          var dd = eq[i] / peak - 1;
          if (!cur) cur = { peakI: peakI, lowI: i, depth: dd, recI: null };
          else if (dd < cur.depth) { cur.depth = dd; cur.lowI = i; }
        }
      }
      if (cur) out.push(cur);
      return out;
    }
    function underwater(eq) { var pk = eq[0]; return eq.map(function (v) { if (v > pk) pk = v; return v / pk - 1; }); }
    var dd = { k: null, top: [] }, ddSvg = $("ddSvg");
    function drawDrawdown() {
      if (!ddSvg || !dd.uw) return;
      var w = Math.round(ddSvg.clientWidth) || 600, h = Math.round(ddSvg.clientHeight) || 150, pT = 3, pB = 8, pR = 8;
      ddSvg.setAttribute("viewBox", "0 0 " + w + " " + h);
      var uw = dd.uw, n = uw.length, lo = Math.min.apply(null, uw) || -0.01;
      dd.w = w; dd.pR = pR;
      dd.X = function (i) { return (i / (n - 1)) * (w - pR); };
      dd.Y = function (v) { return pT + (v / lo) * (h - pT - pB); };
      var path = "M" + uw.map(function (v, i) { return dd.X(i).toFixed(1) + "," + dd.Y(v).toFixed(1); }).join("L");
      $("ddLine").setAttribute("d", path);
      $("ddArea").setAttribute("d", path + "L" + dd.X(n - 1).toFixed(1) + "," + pT + "L0," + pT + "Z");
      attr($("ddZero"), { x1: 0, x2: w - pR, y1: pT, y2: pT });
      attr($("ddCross"), { y1: 0, y2: h });
      attr($("ddBand"), { y: 0, height: h });
      attr($("ddClipR"), { y: -10, height: h + 20 });
      if (!dd.revealing) $("ddClipR").setAttribute("width", dd.revealed ? w + 20 : 0);
      $("ddMarks").innerHTML = dd.top.map(function (p, k) { return '<circle class="dd-mark" style="--k:' + k + '" cx="' + dd.X(p.lowI).toFixed(1) + '" cy="' + dd.Y(p.depth).toFixed(1) + '" r="3.5"/>'; }).join("");
      if (dd.k != null) ddFocus(dd.k, false);
      $("ddMin").textContent = (lo * 100).toFixed(1) + "%";
    }
    function revealDD() {
      if (dd.revealed || !dd.X) return;
      dd.revealed = true;
      var r = $("ddClipR");
      if (REDUCE || !window.MP) { r.setAttribute("width", dd.w + 20); ddSvg.classList.add("done"); return; }
      dd.revealing = true;
      MP.tween(1400, MP.ease.inOut, function (k) { r.setAttribute("width", k * (dd.w + 20)); },
        function () { dd.revealing = false; r.setAttribute("width", dd.w + 20); ddSvg.classList.add("done"); });
    }
    function ddReadAt(i) { $("ddRead").textContent = fdate(dd.dates[i]) + " · " + pctp(dd.uw[i]); }
    function ddFocus(k, setRead) {
      var p = dd.top[k]; if (!p || !dd.X) return;
      dd.k = k;
      var x0 = dd.X(p.peakI), x1 = dd.X(p.recI != null ? p.recI : dd.uw.length - 1);
      attr($("ddBand"), { x: x0, width: Math.max(2, x1 - x0) }); vis($("ddBand"), 1);
      [].forEach.call($("ddRows").children, function (r, i) { r.classList.toggle("hl", i === k); });
      [].forEach.call($("ddMarks").children, function (c, i) { c.classList.toggle("on", i === k); });
      if (setRead) $("ddRead").textContent = pctp(p.depth) + " · " + fdate(dd.dates[p.peakI]) + " → " + (p.recI != null ? fdate(dd.dates[p.recI]) : "ongoing");
    }
    function ddBlur() {
      dd.k = null; vis($("ddBand"), 0);
      [].forEach.call($("ddRows").children, function (r) { r.classList.remove("hl"); });
      [].forEach.call($("ddMarks").children, function (c) { c.classList.remove("on"); });
      if (dd.uw) ddReadAt(dd.uw.length - 1);
    }
    function periodAt(i) {
      for (var k = 0; k < dd.top.length; k++) { var p = dd.top[k], end = p.recI != null ? p.recI : dd.uw.length - 1; if (i >= p.peakI && i <= end) return k; }
      return null;
    }
    function renderDrawdowns(d) {
      var card = $("ddCard");
      if (!card || !d || !d.live || d.eq.length < 3) return false;
      dd.uw = underwater(d.eq); dd.dates = d.dates;
      var periods = drawdownPeriods(d.eq), last = d.dates[d.dates.length - 1];
      var len = function (p) { return daysBetween(d.dates[p.peakI], p.recI != null ? d.dates[p.recI] : last); };
      dd.top = periods.slice().sort(function (a, b) { return a.depth - b.depth; }).slice(0, 5);
      $("ddRows").innerHTML = dd.top.map(function (p, k) {
        return '<tr data-k="' + k + '" tabindex="0"><td>' + pctp(p.depth) + "</td><td>" + fdate(d.dates[p.peakI]) + '</td><td class="dd-low">' + fdate(d.dates[p.lowI]) + "</td><td>" + (p.recI != null ? fdate(d.dates[p.recI]) : "ongoing") + '</td><td class="dd-num">' + len(p) + "</td></tr>";
      }).join("");
      var now = dd.uw[dd.uw.length - 1];
      num($("ddNow"), now < 0 ? pctp(now) : "At a high");
      num($("ddLong"), periods.length ? Math.max.apply(null, periods.map(len)) + " days" : "—");
      $("ddA0").textContent = fdate(d.dates[0]); $("ddA1").textContent = fdate(last);
      // the headline max drawdown is Darwinex's intraday figure when that's deeper
      var deepClose = dd.top.length ? dd.top[0].depth : 0, headlineDD = d.metrics && d.metrics.maxDrawdown;
      if (typeof headlineDD === "number" && headlineDD < deepClose - 1e-6) { $("ddIntra").textContent = pctp(headlineDD); $("ddNote").hidden = false; }
      card.hidden = false;
      ddReadAt(dd.uw.length - 1);
      return true; // drawn by renderExtra once the block is visible and has a width
    }
    (function ddWire() {
      if (!ddSvg) return;
      function at(e) {
        if (!dd.uw || !dd.X) return;
        var r = ddSvg.getBoundingClientRect(), n = dd.uw.length, x = (e.clientX - r.left) * (dd.w / (r.width || dd.w));
        var i = Math.round(Math.min(1, Math.max(0, x / (dd.w - dd.pR))) * (n - 1));
        var c = $("ddCross"), o = $("ddDot");
        attr(c, { x1: dd.X(i), x2: dd.X(i) }); vis(c, 1);
        attr(o, { cx: dd.X(i), cy: dd.Y(dd.uw[i]) }); vis(o, 1);
        var k = periodAt(i);
        if (k == null) { if (dd.k != null) ddBlur(); }
        else if (k !== dd.k) ddFocus(k, false);
        ddReadAt(i);
      }
      function out() { if (!dd.uw) return; vis($("ddCross"), 0); vis($("ddDot"), 0); ddBlur(); }
      ddSvg.addEventListener("pointermove", at);
      ddSvg.addEventListener("pointerdown", at);
      ddSvg.addEventListener("pointerleave", out);
      ddSvg.addEventListener("pointercancel", out);
      ddSvg.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") out(); });
      var rows = $("ddRows");
      rows.addEventListener("mouseover", function (e) { var tr = e.target.closest("tr"); if (tr && FINE) ddFocus(+tr.dataset.k, true); });
      rows.addEventListener("mouseleave", function () { if (FINE) ddBlur(); });
      rows.addEventListener("focusin", function (e) { var tr = e.target.closest("tr"); if (tr) ddFocus(+tr.dataset.k, true); });
      rows.addEventListener("focusout", ddBlur);
      rows.addEventListener("click", function (e) { // touch: tap a row to show it on the curve, tap again to clear
        if (FINE) return;
        var tr = e.target.closest("tr"); if (!tr) return;
        if (+tr.dataset.k === dd.k) ddBlur(); else ddFocus(+tr.dataset.k, true);
      });
    })();

    /* ===================== Darwinex recognition (live only) ===================== */
    function renderRecognition() {
      var d = HK && DATA[HK], band = $("endorse");
      if (!band || !d || !d.live) return;
      var cap = d.aumParts && d.aumParts.darwinexCapitalEur, rank = d.recognition && d.recognition.bestRank;
      if (!cap) return; // the sentence leads with Darwinex's own capital
      $("enCap").textContent = money(cap);
      if (rank) $("enRank").textContent = "#" + rank; else $("enRankWrap").hidden = true;
      if (d.url) $("enLink").href = d.url;
      band.hidden = false;
    }

    /* ===================== theme toggle =====================
       Where supported, the new theme spreads out from the button in a circle. */
    (function themeToggle() {
      var btn = $("themeBtn"), root = document.documentElement;
      if (!btn) return;
      var mq = matchMedia("(prefers-color-scheme: dark)");
      function sync() {
        var t = themeNow();
        btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
        if (root.hasAttribute("data-theme")) { // an explicit choice overrides the OS-based browser-bar colour
          var bar = getComputedStyle(root).getPropertyValue("--paper").trim();
          [].forEach.call(document.querySelectorAll('meta[name="theme-color"]'), function (m) { m.setAttribute("content", bar); });
        }
        var fr = document.querySelector("iframe.giscus-frame");
        if (fr) fr.contentWindow.postMessage({ giscus: { setConfig: { theme: t } } }, "https://giscus.app");
      }
      btn.addEventListener("click", function () {
        var next = themeNow() === "dark" ? "light" : "dark";
        function apply() {
          root.setAttribute("data-theme", next);
          try { localStorage.setItem("theme", next); } catch (e) { /* private mode: choice lasts this page view */ }
          sync();
        }
        if (!document.startViewTransition || REDUCE) { apply(); return; }
        var r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        var R = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
        root.classList.add("vt");
        var vt = document.startViewTransition(apply);
        vt.ready.then(function () {
          root.animate({ clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + R + "px at " + x + "px " + y + "px)"] },
            { duration: 700, easing: "cubic-bezier(.65,0,.35,1)", pseudoElement: "::view-transition-new(root)" });
        }).catch(function () { /* fine */ });
        vt.finished.then(function () { root.classList.remove("vt"); }, function () { root.classList.remove("vt"); });
      });
      if (mq.addEventListener) mq.addEventListener("change", sync);
      sync();
    })();

    /* ===================== hero stats (aggregate of REAL books) ===================== */
    (function hero() {
      var keys = PORTFOLIOS.map(function (p) { return p.key; });
      var real = keys.filter(function (k) { return DATA[k].real; });
      var capEl = $("hCapital"), retEl = $("hReturn"), shEl = $("hSharpe");
      var aum, ret, sh;
      if (real.length) {
        var w = 0; aum = 0; ret = 0; sh = 0;
        real.forEach(function (k) { var a = DATA[k].aum || 1, m = DATA[k].metrics; w += a; aum += (DATA[k].aum || 0); ret += a * m.return; sh += a * m.sharpe; });
        ret /= w; sh /= w;
      } else {
        var cs = computeStats(DATA.COMBINED.eq, DATA.COMBINED.dates);
        aum = 0; ret = cs.tot; sh = cs.sh;
      }
      retEl.classList.add(ret >= 0 ? "pos" : "neg"); num(retEl, pct(ret));
      num(shEl, sh.toFixed(2));
      if (aum > 0) num(capEl, money(aum)); else capEl.textContent = "—";
    })();

    /* ===================== notes / posts ===================== */
    var listEl = $("notesList");
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    var POSTS = [], byId = {}, currentFilter = "all";

    function loadPosts() {
      // the committed file; /api/posts commits to it and Vercel redeploys
      fetch("data/posts.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (d) { applyPosts(Array.isArray(d) ? d : []); })
        .catch(function () { applyPosts([]); });
    }
    function applyPosts(ps) {
      if (ps.length) { POSTS = ps.map(function (p) { p.isoDate = true; return p; }); }
      else { POSTS = NOTES.map(function (n) { return { id: null, date: n.date, isoDate: false, tag: n.tag, title: n.title, body: null }; }); }
      byId = {}; POSTS.forEach(function (p) { if (p.id) byId[p.id] = p; });
      renderNotes(currentFilter);
    }
    function renderNotes(f) {
      var none = POSTS.length === 0;
      $("notesFilter").style.display = none ? "none" : ""; // topic filters are noise with nothing to filter
      var rows = POSTS.filter(function (p) { return f === "all" || p.tag === f; });
      listEl.innerHTML = rows.map(function (p) {
        var d = (p.isoDate === false) ? p.date : fdate(parseISO(p.date));
        var click = p.body ? " note-link" : "";
        var attrs = p.id ? ' data-id="' + esc(p.id) + '"' : "";
        return '<div class="note' + click + '"' + attrs + '><span class="nd">' + esc(d) + '</span><span class="nt">' + esc(p.title) + '</span><span class="ntag">' + esc(p.tag) + '</span></div>';
      }).join("") || (none
        ? '<p class="notes-empty">The first notes are on their way &mdash; subscribe below to get them by email.</p>'
        : '<p class="notes-empty">Nothing under this topic yet.</p>');
    }
    loadPosts();
    $("notesFilter").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; currentFilter = b.dataset.f;[].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); renderNotes(currentFilter); });

    /* ----- post modal + Giscus comments ----- */
    var modal = $("postModal"), pmTitle = $("pmTitle"), pmBody = $("pmBody"), pmDate = $("pmDate"), pmTag = $("pmTag");
    function renderBody(t) {
      return esc(t).split(/\n{2,}/).map(function (blk) {
        blk = blk.trim(); if (!blk) return "";
        if (/^##\s+/.test(blk)) return "<h3>" + blk.replace(/^##\s+/, "") + "</h3>";
        blk = blk.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
        return "<p>" + blk + "</p>";
      }).join("");
    }
    function mountGiscus(term) {
      var c = $("giscus"), note = $("pmCnote"); c.innerHTML = "";
      var gc = CONFIG.comments || {};
      if (!(gc.repo && gc.repoId && gc.categoryId)) { note.hidden = false; return; }
      note.hidden = true;
      var s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      s.setAttribute("data-repo", gc.repo);
      s.setAttribute("data-repo-id", gc.repoId);
      s.setAttribute("data-category", gc.category || "Announcements");
      s.setAttribute("data-category-id", gc.categoryId);
      s.setAttribute("data-mapping", "specific");
      s.setAttribute("data-term", term);
      s.setAttribute("data-strict", "1");
      s.setAttribute("data-reactions-enabled", "1");
      s.setAttribute("data-input-position", "top");
      s.setAttribute("data-theme", themeNow() === "dark" ? "dark" : (gc.theme || "light"));
      s.setAttribute("data-lang", "en");
      s.crossOrigin = "anonymous"; s.async = true;
      c.appendChild(s);
    }
    function openPost(p) {
      pmDate.textContent = (p.isoDate === false) ? p.date : fdate(parseISO(p.date));
      pmTag.textContent = p.tag;
      pmTitle.textContent = p.title;
      pmBody.innerHTML = renderBody(p.body || "");
      modal.hidden = false; document.body.style.overflow = "hidden";
      mountGiscus(p.slug || p.id || p.title);
    }
    function closePost() { modal.hidden = true; document.body.style.overflow = ""; $("giscus").innerHTML = ""; }
    listEl.addEventListener("click", function (e) { var n = e.target.closest(".note-link"); if (!n) return; var p = byId[n.dataset.id]; if (p) openPost(p); });
    $("postClose").addEventListener("click", closePost);
    $("postCloseX").addEventListener("click", closePost);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closePost(); });

    /* ===================== contact form -> /api/contact ===================== */
    (function contact() {
      var form = $("enqForm"), btn = $("sendBtn"), statusEl = $("formStatus");
      var fn = $("fn"), fe = $("fe"), fm = $("fm"), hp = $("company");
      if (!form) return;
      var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      function setStatus(msg, kind) { statusEl.textContent = msg; statusEl.className = "form-status show " + (kind || ""); }
      function mark(elm, ok) { elm.classList.toggle("invalid", !ok); }
      function validate() {
        var okN = fn.value.trim().length >= 2, okE = EMAIL.test(fe.value.trim()), okM = fm.value.trim().length >= 5;
        mark(fn, okN); mark(fe, okE); mark(fm, okM);
        return okN && okE && okM;
      }
      [fn, fe, fm].forEach(function (i) { i.addEventListener("input", function () { if (i.classList.contains("invalid")) validate(); }); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (hp && hp.value) return;
        if (!validate()) { setStatus("Please complete the highlighted fields.", "err"); return; }
        var payload = { name: fn.value.trim(), email: fe.value.trim(), message: fm.value.trim(), company: "" };
        btn.disabled = true; var label = btn.textContent; btn.innerHTML = '<span class="spinner"></span> Sending…';
        fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (body) { return { ok: r.ok, body: body }; }); })
          .then(function (res) {
            if (res.ok) { form.reset(); setStatus("Thank you — your enquiry has been sent. I’ll be in touch.", "ok"); }
            else throw new Error((res.body && res.body.error) || "send failed");
          })
          .catch(function () {
            setStatus("Couldn’t send automatically — opening your email app…", "err");
            var subj = encodeURIComponent("Enquiry via site");
            var body = encodeURIComponent("Name: " + payload.name + "\nEmail: " + payload.email + "\n\n" + payload.message);
            window.location.href = "mailto:" + (CONFIG.contactEmail || "") + "?subject=" + subj + "&body=" + body;
          })
          .finally(function () { btn.disabled = false; btn.textContent = label; });
      });
    })();

    /* ===================== subscribe -> /api/subscribe ===================== */
    (function subscribe() {
      var form = $("subForm"), btn = $("subBtn"), statusEl = $("subStatus"), em = $("subEmail"), hp = $("subCompany");
      if (!form) return;
      var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      function setStatus(msg, kind) { statusEl.textContent = msg; statusEl.className = "form-status show " + (kind || ""); }
      em.addEventListener("input", function () { if (em.classList.contains("invalid") && EMAIL.test(em.value.trim())) em.classList.remove("invalid"); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (hp && hp.value) return;
        var email = em.value.trim();
        if (!EMAIL.test(email)) { em.classList.add("invalid"); setStatus("Please enter a valid email.", "err"); return; }
        em.classList.remove("invalid");
        btn.disabled = true; var label = btn.textContent; btn.innerHTML = '<span class="spinner"></span>';
        fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, company: "" }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
          .then(function (res) { if (res.ok) { form.reset(); setStatus("You’re on the list — thank you.", "ok"); } else throw new Error((res.body && res.body.error) || "failed"); })
          .catch(function () { setStatus("Couldn’t subscribe right now — please try again later.", "err"); })
          .finally(function () { btn.disabled = false; btn.textContent = label; });
      });
    })();

    /* ===================== nav / scroll / spy / mobile ===================== */
    var hdr = $("hdr"), links = [].slice.call(document.querySelectorAll(".navlinks a"));
    var progress = $("progress"), totop = $("totop"), nl = $("navlinks"), navInd = $("navInd"), activeLink = null;
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      hdr.classList.toggle("scrolled", y > 10);
      if (progress) { var h = document.documentElement.scrollHeight - window.innerHeight; progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%"; }
      if (totop) totop.classList.toggle("show", y > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    if (totop) totop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: REDUCE ? "auto" : "smooth" }); });

    // one gold underline that glides to the active (or hovered) link
    function moveInd(a) {
      if (!navInd) return;
      if (!a || !a.offsetWidth) { navInd.style.opacity = "0"; return; }
      navInd.style.opacity = "1"; navInd.style.width = a.offsetWidth + "px"; navInd.style.transform = "translateX(" + a.offsetLeft + "px)";
    }
    var secs = ["hero", "track", "approach", "risk", "notes", "faq", "enquiries"].map(function (id) { return $(id); });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id; activeLink = null;
        links.forEach(function (a) { var on = a.getAttribute("href") === "#" + id; a.classList.toggle("active", on); if (on) activeLink = a; });
        moveInd(activeLink);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    secs.forEach(function (s) { if (s) spy.observe(s); });
    links.forEach(function (a) { a.addEventListener("mouseenter", function () { moveInd(a); }); });
    nl.addEventListener("mouseleave", function () { moveInd(activeLink); });
    $("menubtn").addEventListener("click", function () { nl.classList.toggle("open"); });
    nl.addEventListener("click", function (e) { if (e.target.tagName === "A") nl.classList.remove("open"); });

    /* ===================== reveal on scroll (+ stagger) ===================== */
    var rev = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var t = en.target;
        if (t.classList.contains("stagger")) { [].forEach.call(t.children, function (child, i) { child.style.transitionDelay = (i * 70) + "ms"; }); }
        t.classList.add("in"); rev.unobserve(t);
        // entrance animations hand over to normal hover styles once they finish
        if (t.dataset.settle) setTimeout(function () { t.classList.add("settled"); }, REDUCE ? 0 : +t.dataset.settle);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    [].forEach.call(document.querySelectorAll(".reveal,.stagger,.watch"), function (e) { rev.observe(e); });

    /* ===================== footer ===================== */
    $("yr").textContent = new Date().getFullYear();
    (function social() {
      var f = $("footLinks");
      if (CONFIG.x) { var a = el("a"); a.href = CONFIG.x; a.textContent = "X"; a.target = "_blank"; a.rel = "noopener"; f.appendChild(a); }
      if (CONFIG.linkedin) { var b = el("a"); b.href = CONFIG.linkedin; b.textContent = "LinkedIn"; b.target = "_blank"; b.rel = "noopener"; f.appendChild(b); }
    })();

    // FAQ figures: Darwinex's live fees, and today's quote as the worked example
    (function faqFigures() {
      var d = HK && DATA[HK];
      if (d && d.fees) {
        [].forEach.call(document.querySelectorAll(".fee-m"), function (s) { s.textContent = d.fees.management; });
        [].forEach.call(document.querySelectorAll(".fee-p"), function (s) { s.textContent = d.fees.performance; });
      }
      if (d && d.real && d.eq.length) {
        var q = d.eq[d.eq.length - 1];
        [].forEach.call(document.querySelectorAll(".faq-q"), function (s) { s.textContent = quoteFmt(q); });
        [].forEach.call(document.querySelectorAll(".faq-r"), function (s) { s.textContent = pct(q / 100 - 1); });
      }
    })();
    // "under one year" disclosures stop being true once the record passes 12 months
    (function underAYear() {
      var d = HK && DATA[HK];
      if (d && d.dates.length && (d.dates[d.dates.length - 1] - d.dates[0]) / 864e5 >= 365)
        [].forEach.call(document.querySelectorAll(".under-1y"), function (e) { e.hidden = true; });
    })();
    // mandatory CFD warning: Darwinex's current figure, else the stored one
    if (typeof CONFIG.cfdLossPct === "number") [].forEach.call(document.querySelectorAll(".cfd-pct"), function (s) { s.textContent = CONFIG.cfdLossPct.toFixed(2); });

    render(false);
    drawHeroCard();
    renderExtra();
    renderRecognition();
    // phones fire resize when the browser bar slides away mid-scroll; only a new width needs a redraw
    var rsT, lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(rsT);
      rsT = setTimeout(function () { if (!DATA[state.k].comingSoon) render(false); drawHeroCard(); drawDrawdown(); moveInd(activeLink); }, 150);
    });
  }
})();
