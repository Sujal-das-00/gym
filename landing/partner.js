// Referral partner portal: join, log in, and watch referrals and earnings.
// Talks to /api/partner/*; every rule here is enforced again on the server.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var NAME = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
  var EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  var mode = "join";
  var shareUrl = "";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rupees(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
  function day(v) { try { return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } }

  function api(path, body, method) {
    return fetch("/api/partner" + path, {
      method: method || (body ? "POST" : "GET"),
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.error || "Something went wrong. Please try again."); e.status = res.status; throw e; }
        return data;
      });
    });
  }

  function note(id, text) { var el = $(id); el.textContent = text || ""; el.hidden = !text; }

  // ---------- Page chrome: menu, reveal, live numbers ----------
  $("year").textContent = new Date().getFullYear();
  var nav = $("siteNav"), toggle = $("navToggle");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("use").setAttribute("href", "/landing/icons.svg#" + (open ? "close" : "menu"));
  }
  toggle.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
  nav.addEventListener("click", function (e) { if (e.target.tagName === "A") setMenu(false); });
  window.addEventListener("scroll", function () { $("siteHeader").classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });

  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add("in"); });
  }

  // The copy ships with the default numbers; the server's config overrides them so the
  // page never disagrees with what a partner is actually paid.
  var program = null;
  function fmt(n) { return Number(n).toLocaleString("en-IN"); }
  fetch("/api/public/referral-program").then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
    if (!p) return;
    program = p;
    Array.prototype.forEach.call(document.querySelectorAll("[data-fill]"), function (el) {
      var v = p[el.getAttribute("data-fill")];
      if (v != null) el.textContent = fmt(v);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-fill-mail]"), function (el) {
      el.textContent = p.supportEmail; el.href = "mailto:" + p.supportEmail;
    });
    calc();
  }).catch(function () { /* defaults stay */ });

  // ---------- Earnings calculator ----------
  function calc() {
    var n = Number($("calcRange").value);
    var reward = program ? program.reward : 1000;
    $("calcCount").textContent = n;
    $("calcTotal").textContent = rupees(n * reward);
  }
  $("calcRange").addEventListener("input", calc);
  calc();

  // Header/CTA buttons open the join card in the requested mode.
  Array.prototype.forEach.call(document.querySelectorAll("[data-mode]"), function (a) {
    a.addEventListener("click", function () {
      setMode(a.getAttribute("data-mode"));
      setTimeout(function () { var f = mode === "join" ? $("jName") : $("lEmail"); f.focus({ preventScroll: true }); }, 400);
    });
  });

  function setMode(next) {
    mode = next;
    var join = next === "join";
    $("joinForm").hidden = !join;
    $("loginForm").hidden = join;
    $("authTitle").textContent = join ? "Join the programme" : "Partner log in";
    $("authLede").textContent = join ? "Create a partner account to get your referral code. It's free." : "Log in to see your referrals and earnings.";
    $("toggleLine").innerHTML = join ? 'Already a partner? <a href="#" id="toggleMode">Log in</a>' : 'New here? <a href="#" id="toggleMode">Join the programme</a>';
    note("formError", "");
  }
  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "toggleMode") { e.preventDefault(); setMode(mode === "join" ? "login" : "join"); }
  });

  function busy(form, on, idle) {
    var b = form.querySelector("button[type=submit]");
    b.disabled = on;
    b.querySelector(".label").textContent = on ? "Please wait…" : idle;
  }

  // ---------- Join ----------
  $("joinForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = { name: $("jName").value.trim(), email: $("jEmail").value.trim(), phone: $("jPhone").value.trim(), password: $("jPassword").value };
    var errs = {
      jName: !NAME.test(v.name) || v.name.length < 2 ? "Enter your name using letters only." : "",
      jEmail: !EMAIL.test(v.email) ? "Enter a valid email address." : "",
      jPhone: v.phone.replace(/\D/g, "").length < 10 ? "Enter a valid phone number." : "",
      jPassword: v.password.length < 8 || !/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password) ? "Use 8+ characters with a letter and a number." : "",
    };
    var bad = false;
    Object.keys(errs).forEach(function (k) { $(k + "-error").textContent = errs[k]; if (errs[k]) bad = true; });
    if (bad) return;
    note("formError", "");
    busy(this, true, "Join and get my code");
    var form = this;
    api("/signup", v).then(loadDashboard).catch(function (err) {
      note("formError", err.message); busy(form, false, "Join and get my code");
    });
  });

  // ---------- Log in ----------
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = this;
    var email = $("lEmail").value.trim(), password = $("lPassword").value;
    if (!email || !password) { note("formError", "Enter your email and password."); return; }
    note("formError", "");
    busy(form, true, "Log in");
    api("/login", { email: email, password: password }).then(loadDashboard).catch(function (err) {
      note("formError", err.message); busy(form, false, "Log in");
    });
  });

  // ---------- Dashboard ----------
  function render(d) {
    $("marketing").hidden = true;
    $("dashView").hidden = false;
    Array.prototype.forEach.call(document.querySelectorAll("[data-marketing]"), function (el) { el.hidden = true; });
    $("homeLink").hidden = false;
    window.scrollTo(0, 0);
    $("dashName").textContent = "Hi, " + d.partner.name.split(" ")[0];
    $("codeText").textContent = d.partner.referralCode;
    shareUrl = window.location.origin + "/signup?ref=" + d.partner.referralCode;
    $("shareLink").textContent = shareUrl;
    $("stTotal").textContent = d.totalReferrals;
    $("stSuccess").textContent = d.successfulReferrals;
    $("stEarned").textContent = rupees(d.earned);
    $("stAvail").textContent = rupees(d.available);
    $("programNote").textContent = "A referral counts as successful once the gym buys the one-time licence and we approve it. You then earn " +
      rupees(d.program.reward) + "; they pay " + rupees(d.program.effectivePrice) + " instead of " + rupees(d.program.effectivePrice + d.program.discount) + ". The monthly plan doesn't qualify.";
    $("supportNote").innerHTML = "Payouts are settled within 24 hours. Questions? Message us at <a href=\"mailto:" + esc(d.program.supportEmail) + "\">" + esc(d.program.supportEmail) + "</a>.";
    $("payBtn").disabled = d.available <= 0;

    $("refList").innerHTML = d.referrals.length ? d.referrals.map(function (r) {
      return '<div class="dash-row"><div><strong>' + esc(r.gymName) + "</strong><small>Signed up " + day(r.createdAt) + "</small></div>" +
        '<span class="status-pill ' + esc(r.status) + '">' + (r.status === "successful" ? "Successful · +" + rupees(r.reward) : "Pending") + "</span></div>";
    }).join("") : '<p class="field-hint">No referrals yet. Share your code or link to get started.</p>';

    $("payList").innerHTML = d.payouts.length ? d.payouts.map(function (p) {
      return '<div class="dash-row"><div><strong>' + rupees(p.amount) + "</strong><small>Requested " + day(p.requestedAt) + (p.note ? " · " + esc(p.note) : "") + "</small></div>" +
        '<span class="status-pill ' + esc(p.status) + '">' + esc(p.status === "requested" ? "Processing" : p.status === "paid" ? "Paid" : "Rejected") + "</span></div>";
    }).join("") : '<p class="field-hint">No payouts yet.</p>';
  }

  function loadDashboard() { return api("/dashboard").then(render); }

  function copy(text, button) {
    var done = function () { var old = button.textContent; button.textContent = "Copied"; setTimeout(function () { button.textContent = old; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
  }
  $("copyCode").addEventListener("click", function () { copy($("codeText").textContent, this); });
  $("copyLink").addEventListener("click", function () { copy(shareUrl, this); });

  $("payoutForm").addEventListener("submit", function (e) {
    e.preventDefault();
    note("payError", ""); note("payOk", "");
    api("/payouts", { payoutDetails: $("payDetails").value }).then(function (r) {
      note("payOk", "Payout of " + rupees(r.amount) + " requested. We'll settle it within 24 hours.");
      return loadDashboard();
    }).catch(function (err) { note("payError", err.message); });
  });

  $("logoutBtn").addEventListener("click", function () {
    api("/logout", {}).catch(function () {}).then(function () { window.location.reload(); });
  });

  // Resume an existing session.
  api("/dashboard").then(render).catch(function () { setMode("join"); });
})();
