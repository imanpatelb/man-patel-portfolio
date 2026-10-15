/* =====================================================================
   Post pages (/notes/<slug>, built by cloudflare/pages.js): Giscus
   comments, the subscribe form and "Copy link". Small on purpose:
   no charts here.
   ===================================================================== */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }

  /* ----- comments: GitHub Discussions via Giscus, one thread per post (the slug) ----- */
  var g = $("giscus");
  if (g) {
    var s = document.createElement("script");
    s.src = "https://giscus.app/client.js";
    [["repo", g.dataset.repo], ["repo-id", g.dataset.repoId], ["category", g.dataset.category], ["category-id", g.dataset.categoryId],
      ["mapping", "specific"], ["term", g.dataset.term], ["strict", "1"], ["reactions-enabled", "1"], ["input-position", "top"],
      ["theme", "light"], ["lang", "en"], ["loading", "lazy"]].forEach(function (a) { s.setAttribute("data-" + a[0], a[1]); });
    s.crossOrigin = "anonymous"; s.async = true;
    g.appendChild(s);
  }

  /* ----- copy link ----- */
  var copy = $("copyLink");
  if (copy) copy.addEventListener("click", function () {
    var url = copy.dataset.url, label = copy.textContent;
    function done(ok) { copy.textContent = ok ? "Copied ✓" : url; setTimeout(function () { copy.textContent = label; }, 2200); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
    else done(false);
  });

  /* ----- subscribe (same endpoint and messages as the home page) ----- */
  var form = $("subForm");
  if (form) {
    var em = $("subEmail"), hp = $("subCompany"), sb = $("subBtn"), st = $("subStatus"), EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    function say(msg, kind) { st.textContent = msg; st.className = "form-status show " + (kind || ""); }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (hp && hp.value) return;
      var email = em.value.trim();
      if (!EMAIL.test(email)) { em.classList.add("invalid"); say("Please enter a valid email.", "err"); return; }
      em.classList.remove("invalid");
      sb.disabled = true; var label = sb.textContent; sb.innerHTML = '<span class="spinner"></span>';
      fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, company: "" }) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, body: b }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.body && res.body.error) || "failed");
          form.reset();
          say(res.body && res.body.pending ? "Almost there — check your inbox and confirm." : "You’re on the list — thank you.", "ok");
        })
        .catch(function () { say("Couldn’t subscribe right now — please try again later.", "err"); })
        .finally(function () { sb.disabled = false; sb.textContent = label; });
    });
  }
})();
