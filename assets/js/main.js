/* =====================================================================
   Man Patel — Discretionary Trader
   Data-driven front-end. Loads /data/portfolios.json, renders the
   track record, notes, and wires the contact form to /api/contact.

   Real books supply exact Darwinex `metrics` + `monthly` returns +
   `days` (best/worst). The displayed stats are the exact figures; the
   chart is a daily curve reconstructed to hit every real month-end and
   embed every real best/worst day. Books without `metrics` show a
   clearly-labelled illustrative curve.
   ===================================================================== */
(function () {
  "use strict";

  var REDUCE = matchMedia("(prefers-reduced-motion:reduce)").matches;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

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

    /* ===================== build all books ===================== */
    (function build() {
      var refDates = null;
      PORTFOLIOS.forEach(function (p) {
        if (p.comingSoon) { DATA[p.key] = { comingSoon: true, strat: p.strat, url: p.darwinexUrl || "", real: false }; return; }
        var hasSeries = !!(p.series && p.series.length > 1);
        var real = !!(p.metrics && (hasSeries || p.monthly));
        var c = hasSeries ? fromSeries(p.series) : (real ? reconstruct(p) : synth(p));
        DATA[p.key] = {
          dates: c.dates, eq: c.eq, strat: p.strat, url: p.darwinexUrl,
          real: real, live: !!p.liveSynced, asOf: p.asOf || null, asOfTime: p.asOfTime || null, metrics: p.metrics || null,
          aum: (typeof p.aum === "number" ? p.aum : null), aumParts: p.aumParts || null,
          inception: p.inception || null
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
      DATA.COMBINED = { dates: refDates.slice(0, len), eq: combEq, strat: "All books, equal-weight blend", url: "", real: allReal, combined: true, metrics: null, aum: sumAum(keys), inception: earliest };
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
    function fdate(dt) { return dt.getDate() + " " + MO[dt.getMonth()] + " " + String(dt.getFullYear()).slice(2); }
    var SYM = { EUR: "€", USD: "$", GBP: "£" };
    function money(v) { return (SYM[CUR] || "") + Math.round(v).toLocaleString("en-US"); }
    function quoteFmt(v) { return v.toFixed(2); }
    function pct(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%"; }
    function pctp(v) { return (v * 100).toFixed(2) + "%"; }

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
    var soonView = $("soonView"), chartboxEl = $("chartbox"), statgridEl = $("statgrid"), bignumEl = document.querySelector(".bignum"), trMetaEl = $("trMeta");
    var endpt = $("endpt"), endring = $("endring");
    var MOY = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function monthYear(s) { var d = parseISO(s); return MOY[d.getMonth()] + " " + d.getFullYear(); }
    function metaItem(k, v) { return '<span><span class="mk">' + k + '</span><span class="mv">' + v + '</span></span>'; }

    // smoothly roll a numeric element from its previous value to the new one
    var lastVal = new WeakMap();
    function tnum(elm, to, fmt) {
      if (REDUCE || !lastVal.has(elm)) { elm.textContent = fmt(to); lastVal.set(elm, to); return; }
      var from = lastVal.get(elm); lastVal.set(elm, to);
      if (from === to) { elm.textContent = fmt(to); return; }
      var t0 = null, dur = 520;
      function step(t) {
        if (!t0) t0 = t;
        var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        elm.textContent = fmt(from + (to - from) * e);
        if (k < 1 && lastVal.get(elm) === to) requestAnimationFrame(step); else elm.textContent = fmt(to);
      }
      requestAnimationFrame(step);
    }
    var f2 = function (v) { return v.toFixed(2); };
    var fwin = function (v) { return (v * 100).toFixed(1) + "%"; };
    function render(animate) {
      var full = DATA[state.k];

      // coming-soon book: show placeholder, hide the live widgets
      if (full.comingSoon) {
        if (soonView) { soonView.hidden = false; var sk = $("soonKey"); if (sk) sk.textContent = state.k; }
        bignumEl.style.display = "none"; chartboxEl.style.display = "none"; statgridEl.style.display = "none";
        if (trMetaEl) trMetaEl.style.display = "none";
        var strat0 = $("trStrat"); strat0.textContent = full.strat || "New programme";
        $("liveLabel").textContent = "in preparation"; var db = $("dataBadge"); db.style.display = ""; db.textContent = "coming soon";
        return;
      }
      if (soonView) soonView.hidden = true;
      bignumEl.style.display = ""; chartboxEl.style.display = ""; statgridEl.style.display = ""; if (trMetaEl) trMetaEl.style.display = "";

      var i0 = sliceIdx(full.dates, state.t);
      var eq = full.eq.slice(i0), dates = full.dates.slice(i0); cur = { eq: eq, dates: dates };
      var mn = Math.min.apply(null, eq), mx = Math.max.apply(null, eq), rng = (mx - mn) || 1;
      function py(v) { return padT + (1 - (v - mn) / rng) * (H - padT - padB); }
      var nn = eq.length, pts = []; for (var i = 0; i < nn; i++) pts.push(px(i, nn).toFixed(1) + "," + py(eq[i]).toFixed(1));
      var d = "M" + pts.join(" L"); line.setAttribute("d", d); area.setAttribute("d", d + " L" + W0 + "," + H + " L0," + H + " Z");
      $("d0").textContent = fdate(dates[0]);
      $("d1").textContent = fdate(dates[dates.length - 1]);
      // live pulse at the latest point
      var lx = px(nn - 1, nn), ly = py(eq[eq.length - 1]);
      endpt.setAttribute("cx", lx); endpt.setAttribute("cy", ly); endpt.style.opacity = "1";
      endring.setAttribute("cx", lx); endring.setAttribute("cy", ly); endring.style.opacity = "1";

      // big number: current quote + return over the visible window
      var winRet = eq[eq.length - 1] / eq[0] - 1;
      tnum($("bVal"), eq[eq.length - 1], quoteFmt);
      var rv = $("bRet"); rv.className = "ret tnum " + (winRet >= 0 ? "pos" : "neg"); tnum(rv, winRet, pct);
      var ctxBits = [];
      if (!full.real && !full.combined) ctxBits.push("illustrative");
      ctxBits.push(state.t === "ALL" ? "since inception" : "over " + state.t);
      $("bCtx").textContent = ctxBits.join(" · ");

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

      // stat grid: canonical full-period stats (exact for real books)
      var s = bookStats(state.k);
      var rr = $("sRet"); rr.className = "v tnum " + (s.tot >= 0 ? "pos" : "neg"); tnum(rr, s.tot, pct);
      tnum($("sDD"), s.mdd, pctp);
      tnum($("sSh"), s.sh, f2);
      tnum($("sSo"), s.so, f2);
      tnum($("sVo"), s.vo, pctp);
      tnum($("sBest"), s.best, pct);
      tnum($("sWorst"), s.worst, pct);
      tnum($("sWin"), s.win, fwin);

      // badges
      var liveLabel = $("liveLabel"), dataBadge = $("dataBadge");
      if (full.combined) { liveLabel.textContent = "equal-weight blend of live books"; dataBadge.style.display = ""; dataBadge.textContent = "blended"; }
      else if (full.real) {
        var asOf = full.asOf ? fdate(parseISO(full.asOf)) : "";
        // with a timestamp, show the visitor's local date + time, zone named
        var at = full.asOfTime ? new Date(full.asOfTime) : null;
        if (at && !isNaN(at)) asOf = fdate(at) + ", " + at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
        liveLabel.textContent = full.live ? "live · Darwinex · updated " + asOf : "recorded via Darwinex" + (asOf ? " · as of " + asOf : "");
        dataBadge.style.display = "none";
      }
      else { liveLabel.textContent = "preview · illustrative"; dataBadge.style.display = ""; dataBadge.textContent = "illustrative data"; }

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
      tip.innerHTML = fdate(cur.dates[idx]) + " &nbsp;" + quoteFmt(cur.eq[idx]) + " &nbsp;" + pct(ret);
      tip.style.left = (f * r.width) + "px"; tip.style.top = "-6px"; tip.style.opacity = "1";
    }
    function leave() { cross.style.opacity = "0"; dot.style.opacity = "0"; tip.style.opacity = "0"; }
    svg.addEventListener("mousemove", move); svg.addEventListener("mouseleave", leave);
    svg.addEventListener("touchstart", move, { passive: true }); svg.addEventListener("touchmove", move, { passive: true }); svg.addEventListener("touchend", leave);

    // segmented control from data
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
    seg.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.k = b.dataset.k;[].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); render(true); });
    $("tf").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; state.t = b.dataset.t;[].forEach.call(this.children, function (x) { x.classList.toggle("on", x === b); }); render(true); });

    /* ===================== count-up ===================== */
    function countUp(elm, target, fmt, dur) {
      if (REDUCE) { elm.textContent = fmt(target); return; }
      var t0 = null;
      function step(t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur); var e = 1 - Math.pow(1 - k, 3); elm.textContent = fmt(target * e); if (k < 1) requestAnimationFrame(step); }
      requestAnimationFrame(step);
    }

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
      retEl.textContent = pct(ret); retEl.classList.add(ret >= 0 ? "pos" : "neg");
      shEl.textContent = sh.toFixed(2);
      var showCap = aum > 0 ? aum : null;
      if (!showCap) { capEl.textContent = "—"; }
      else {
        var fire = false;
        var obs = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting && !fire) { fire = true; countUp(capEl, showCap, money, 1100); obs.disconnect(); } }); }, { rootMargin: "0px 0px -10% 0px" });
        var hs = document.querySelector(".hero-stats"); if (hs) obs.observe(hs); else countUp(capEl, showCap, money, 1100);
      }
    })();

    /* ===================== notes / posts ===================== */
    var listEl = $("notesList");
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
    var POSTS = [], byId = {}, currentFilter = "all";

    function loadPosts() {
      fetch("/api/posts", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (d) { applyPosts((d && d.posts) || []); })
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
        var attr = p.id ? ' data-id="' + esc(p.id) + '"' : "";
        return '<div class="note' + click + '"' + attr + '><span class="nd">' + esc(d) + '</span><span class="nt">' + esc(p.title) + '</span><span class="ntag">' + esc(p.tag) + '</span></div>';
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
      s.setAttribute("data-theme", gc.theme || "light");
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
    var progress = $("progress"), totop = $("totop");
    function onScroll() {
      var y = window.scrollY || window.pageYOffset;
      hdr.classList.toggle("scrolled", y > 10);
      if (progress) { var h = document.documentElement.scrollHeight - window.innerHeight; progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%"; }
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
        if (t.classList.contains("stagger")) { [].forEach.call(t.children, function (child, i) { child.style.transitionDelay = (i * 70) + "ms"; }); }
        t.classList.add("in"); rev.unobserve(t);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    [].forEach.call(document.querySelectorAll(".reveal,.stagger"), function (e) { rev.observe(e); });

    /* ===================== footer ===================== */
    $("yr").textContent = new Date().getFullYear();
    (function social() {
      var f = $("footLinks");
      if (CONFIG.x) { var a = el("a"); a.href = CONFIG.x; a.textContent = "X"; a.target = "_blank"; a.rel = "noopener"; f.appendChild(a); }
      if (CONFIG.linkedin) { var b = el("a"); b.href = CONFIG.linkedin; b.textContent = "LinkedIn"; b.target = "_blank"; b.rel = "noopener"; f.appendChild(b); }
    })();

    render(false);
    requestAnimationFrame(function () { render(true); });
  }
})();
