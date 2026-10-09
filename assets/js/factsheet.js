/* =====================================================================
   KBAD factsheet — one A4 page built from the live Darwinex data
   (/api/darwin). If live data can't be fetched, no factsheet is drawn:
   people keep and forward these, so it never shows a stored snapshot.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var INSTR = { NI225: "Nikkei 225", XAGUSD: "Silver", XTIUSD: "WTI crude oil", XBRUSD: "Brent crude", NDX: "Nasdaq 100", NDXm: "Nasdaq 100", XAUUSD: "Gold", MSTR: "Strategy (MSTR)", GDAXI: "DAX 40", GDAXIm: "DAX 40", EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", SPX500: "S&P 500", SP500: "S&P 500", WS30: "Dow Jones", US30: "Dow Jones" };

  function pct(v) { return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%"; }
  function pctp(v) { return (v * 100).toFixed(2) + "%"; }
  function eur(v) { return "€" + Math.round(v).toLocaleString("en-US"); }
  function usd(v) { return "$" + Math.round(v).toLocaleString("en-US"); }
  function parseISO(s) { var p = String(s).split("-"); return new Date(+p[0], p[1] - 1, +p[2]); }
  function dShort(d) { return d.getDate() + " " + MO[d.getMonth()] + " " + String(d.getFullYear()).slice(2); }
  function dLong(d) { return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function iname(t) { return INSTR[t] || t; }
  function fmtDur(s) { return String(s).replace(/(\d+)([DHMS])/g, function (_, n, u) { return n + u.toLowerCase() + " "; }).trim(); }

  function fail() {
    $("fsMsg").textContent = "Live data from Darwinex is unavailable right now, so the factsheet can’t be generated. Please try again shortly.";
    $("sheet").hidden = true; $("fsSave").disabled = true;
  }

  fetch("data/portfolios.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (cfg) {
      var book = ((cfg && cfg.portfolios) || []).filter(function (p) { return p.live; })[0] || { key: "KBAD" };
      return fetch("/api/darwin?ticker=" + encodeURIComponent(book.key))
        .then(function (r) { if (!r.ok) throw new Error("live " + r.status); return r.json(); })
        .then(function (d) { if (!d.series || d.series.length < 2) throw new Error("no series"); render(cfg || {}, book, d); });
    })
    .catch(fail);

  function render(cfg, book, d) {
    var conf = cfg.config || {}, m = d.metrics || {};
    var asOf = parseISO(d.asOf), start = parseISO(d.series[0][0]);
    // Darwinex measures max drawdown intraday; never show less than its figure
    var mdd = typeof book.maxDrawdownFloor === "number" ? Math.min(m.maxDrawdown, book.maxDrawdownFloor) : m.maxDrawdown;

    document.title = d.ticker + " factsheet — Man Patel — " + dShort(asOf); // becomes the PDF's file name
    $("fsTicker").textContent = d.ticker; $("fsTicker2").textContent = d.ticker;
    $("fsAsOf").textContent = "As of " + dLong(asOf);
    $("fsQuote").textContent = d.quote.toFixed(2);
    $("fsRet").textContent = pct(m.return) + " since inception";

    var kpis = [["Total return", pct(m.return)], ["Annualised", pct(m.annReturn)], ["Max drawdown", pctp(mdd)], ["Volatility (ann.)", pctp(m.volatility)],
      ["Sharpe", m.sharpe.toFixed(2)], ["Sortino", m.sortino.toFixed(2)], ["Win rate (days)", (m.winRate * 100).toFixed(1) + "%"], ["Best / worst month", pct(m.bestMonth) + " / " + pct(m.worstMonth)]];
    $("fsKpis").innerHTML = kpis.map(function (k) { return '<div class="fs-kpi"><div class="fs-k">' + k[0] + '</div><div class="v">' + k[1] + "</div></div>"; }).join("");

    // equity curve: fixed viewBox, stretched to the sheet; the stroke doesn't scale
    var q = d.series.map(function (p) { return p[1]; }), n = q.length, W = 700, H = 118, pad = 4;
    var lo = Math.min.apply(null, q), hi = Math.max.apply(null, q), rg = (hi - lo) || 1;
    var X = function (i) { return (i / (n - 1)) * W; }, Y = function (v) { return pad + (1 - (v - lo) / rg) * (H - pad * 2); };
    var path = "M" + q.map(function (v, i) { return X(i).toFixed(1) + "," + Y(v).toFixed(1); }).join(" L");
    $("fsLine").setAttribute("d", path);
    $("fsArea").setAttribute("d", path + " L" + W + "," + H + " L0," + H + " Z");
    $("fsA0").textContent = dShort(start); $("fsA1").textContent = dShort(asOf);

    // monthly returns: same heatmap as the site
    var byYear = {};
    (d.monthly || []).forEach(function (o) { (byYear[o.m.slice(0, 4)] = byYear[o.m.slice(0, 4)] || {})[+o.m.slice(5, 7) - 1] = o.r; });
    $("fsMonthly").innerHTML = Object.keys(byYear).sort().map(function (y) {
      var row = byYear[y], tot = 1, cells = "";
      for (var i = 0; i < 12; i++) {
        if (!(i in row)) { cells += '<div class="mo-cell empty"><span class="mo-m">' + MO[i] + '</span><span class="mo-v">&ndash;</span></div>'; continue; }
        var r = row[i]; tot *= 1 + r;
        var a = (0.10 + 0.45 * Math.min(Math.abs(r) / 0.10, 1)).toFixed(3);
        cells += '<div class="mo-cell ' + (r > 0 ? "up" : r < 0 ? "down" : "") + '" style="--a:' + a + '"><span class="mo-m">' + MO[i] + '</span><span class="mo-v">' + pct(r) + "</span></div>";
      }
      return '<div class="mo-row"><div class="mo-year"><span class="mo-y">' + y + '</span><span class="mo-tot ' + (tot - 1 >= 0 ? "pos" : "neg") + '">' + pct(tot - 1) + '</span></div><div class="mo-grid">' + cells + "</div></div>";
    }).join("");

    // deepest drawdowns on daily closes
    var periods = [], peak = q[0], peakI = 0, cur = null;
    for (var i = 1; i < n; i++) {
      if (q[i] >= peak) { if (cur) { cur.recI = i; periods.push(cur); cur = null; } peak = q[i]; peakI = i; }
      else { var dd = q[i] / peak - 1; if (!cur) cur = { peakI: peakI, depth: dd, recI: null }; else if (dd < cur.depth) cur.depth = dd; }
    }
    if (cur) periods.push(cur);
    var dates = d.series.map(function (p) { return parseISO(p[0]); });
    $("fsDD").innerHTML = periods.sort(function (a, b) { return a.depth - b.depth; }).slice(0, 3).map(function (p) {
      var end = p.recI != null ? dates[p.recI] : asOf;
      return "<tr><td>" + pctp(p.depth) + "</td><td>" + dShort(dates[p.peakI]) + "</td><td>" + (p.recI != null ? dShort(end) : "ongoing") + '</td><td class="n">' + Math.round((end - dates[p.peakI]) / 864e5) + "</td></tr>";
    }).join("");

    // capital and activity
    var a = d.aum || {}, act = d.activity || {}, rows = [];
    if (a.totalEur) rows.push(["Assets under management", eur(a.totalEur)]);
    if (a.darwinexCapitalEur) rows.push(["Darwinex’s own capital", eur(a.darwinexCapitalEur)]);
    if (a.investorsUsd) rows.push(["Investors", usd(a.investorsUsd) + " · " + a.investors]);
    if (act.trades != null) rows.push(["Trades", act.trades.toLocaleString("en-US") + (act.avgDuration ? " · avg " + fmtDur(act.avgDuration) : "")]);
    if (act.winningTrades != null) rows.push(["Winning trades", (act.winningTrades * 100).toFixed(1) + "%"]);
    rows.push(["Inception", dLong(start)]);
    $("fsCap").innerHTML = rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join("");

    // asset mix: top four, tail folded into "Other"
    var mix = d.allocation || [], top = mix.length > 5 ? mix.slice(0, 4) : mix, rest = mix.length > 5 ? mix.slice(4) : [];
    var max = Math.max.apply(null, mix.map(function (x) { return x.pct; }).concat([0.0001]));
    var li = function (name, sub, p, other) { return '<li' + (other ? ' class="other"' : "") + "><span>" + esc(name) + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</span><span><span class="bar" style="width:' + (p / max * 100).toFixed(1) + '%"></span></span><span class="pv">' + (p * 100).toFixed(1) + "%</span></li>"; };
    $("fsMix").innerHTML = top.map(function (x) { return li(iname(x.name), "", x.pct, false); }).join("") +
      (rest.length ? li("Other", rest.map(function (x) { return iname(x.name).replace(/ /g, " "); }).join(", "), rest.reduce(function (s, x) { return s + x.pct; }, 0), true) : "");

    // fees and structure (Darwinex's live fees, stored values as fallback)
    var fees = d.fees || { management: 1.2, performance: 20 };
    $("fsFees").textContent = "Darwinex charges investors " + fees.management + "% a year on actively invested equity and " + fees.performance +
      "% of profits, settled quarterly on a high-water mark basis. Darwinex offers KBAD and runs its risk engine independently of the trader, targeting a maximum monthly VaR (95%) of 6.5%; it is authorised by the FCA (UK) and the CNMV (Spain).";

    var rec = d.recognition;
    if (a.darwinexCapitalEur) {
      $("fsEndorse").innerHTML = "Darwinex has invested <strong>" + eur(a.darwinexCapitalEur) + "</strong> of its own capital in " + esc(d.ticker) +
        (rec && rec.bestRank ? ", and ranked it as high as <strong>#" + rec.bestRank + "</strong> in its capital-allocation programme." : ".");
      $("fsEndorse").hidden = false;
    }

    var cfd = typeof d.cfdLossPct === "number" ? d.cfdLossPct : conf.cfdLossPct;
    $("fsCfd").textContent = "CFDs are complex instruments and come with a high risk of losing money rapidly due to leverage. " +
      (typeof cfd === "number" ? cfd.toFixed(2) + "% of retail investor accounts lose money when trading CFDs with Darwinex. " : "") +
      "You should consider whether you understand how CFDs work and whether you can afford to take the high risk of losing your money.";
    var underYear = (asOf - start) / 864e5 < 365;
    $("fsDisc").textContent = "Capital at risk. Past performance is not indicative of future results. Figures are calculated from Darwinex’s published daily quotes using Darwinex’s formulas and are before Darwinex’s fees; max drawdown is Darwinex’s intraday figure where deeper. " +
      (underYear ? "The track record is under one year, so annualised figures are extrapolated. " : "") +
      "This factsheet is a personal track record, not investment advice or an offer to invest; investing in " + d.ticker + " happens on Darwinex, under its terms and risk warnings.";

    $("fsMail").textContent = conf.contactEmail || "mptraderx.capital@gmail.com";
    $("fsSite").textContent = String(conf.siteUrl || "https://man-patel-portfolio.vercel.app").replace(/^https?:\/\//, "");

    $("fsMsg").hidden = true; $("sheet").hidden = false;
    var save = $("fsSave"); save.disabled = false;
    save.addEventListener("click", function () { window.print(); });
  }
})();
