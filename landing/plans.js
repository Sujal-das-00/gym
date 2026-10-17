// Plans and payment page. A gym owner whose free trial has ended lands here (the dashboard
// redirects on a 402), picks a plan, pays by UPI and says they have paid. The super-admin
// verifies the payment by hand; until then each "I've paid" can buy a day of access, a few
// times at most (the server enforces the cap). All amounts come from the server.
(function () {
  "use strict";

  var TOKEN_KEY = "gym-admin-token";
  var $ = function (id) { return document.getElementById(id); };
  var S = null;       // last /api/licence response
  var role = "";
  var showPay = true; // false when the owner clicked "choose a different plan"

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rs(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }

  function api(path, body) {
    var headers = body ? { "Content-Type": "application/json" } : {};
    if (token()) headers.Authorization = "Bearer " + token();
    return fetch("/api" + path, { method: body ? "POST" : "GET", credentials: "include", headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.status === 401) { window.location.href = "/login"; throw new Error("Please sign in"); }
          if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
          return data;
        });
      });
  }

  function when(ms) {
    return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  }

  function notice(a) {
    var el = $("notice"), cls = "plans-notice ", html = "";
    if (a.phase === "licensed") {
      cls += "ok"; html = "<strong>Your plan is active.</strong> Thank you for choosing Gymboo.";
    } else if (a.phase === "suspended") {
      cls += "bad"; html = "<strong>This gym is suspended.</strong> Please contact us at <a href=\"mailto:" + esc(S.supportEmail) + "\">" + esc(S.supportEmail) + "</a>.";
    } else if (a.phase === "grace") {
      cls += "warn";
      html = "<strong>Temporary access until " + when(a.graceUntil) + ".</strong> Your payment is waiting to be verified (temporary day " + a.graceDaysUsed + " of " + a.graceDaysMax + ").";
    } else if (a.phase === "trial") {
      cls += "info";
      html = "<strong>" + (a.daysLeft === 0 ? "Your free trial ends today." : a.daysLeft + " day" + (a.daysLeft === 1 ? "" : "s") + " left in your free trial.") + "</strong> Pick a plan now to keep going without a break.";
    } else {
      cls += "bad";
      html = "<strong>Your free trial has ended" + (a.daysOver ? " " + a.daysOver + " day" + (a.daysOver === 1 ? "" : "s") + " ago" : "") + ".</strong> Choose a plan and pay to keep using Gymboo. Your data is safe.";
    }
    el.className = cls; el.innerHTML = html;
  }

  // The whole price build-up, so the owner can see exactly how the amount was reached.
  function breakdownHtml(p) {
    var plan = p.plan === "lifetime" ? "One-time licence" : "Monthly plan";
    var rows = '<div class="bd-row"><span>' + plan + "</span><span>" + rs(p.listPrice) + "</span></div>";
    if (p.discount > 0) {
      rows += '<div class="bd-row off"><span>Referral discount' + (S.referralCode ? " (" + esc(S.referralCode) + ")" : "") + "</span><span>−" + rs(p.discount) + "</span></div>";
    }
    if (p.adjustment > 0) {
      rows += '<div class="bd-row off"><span>Special price for your gym</span><span>−' + rs(p.adjustment) + "</span></div>";
    }
    rows += '<div class="bd-row total"><span>Total payable</span><span>' + rs(p.amount) + "</span></div>";
    return rows;
  }

  function planCard(key, title, tag, blurb, points) {
    var q = S.quotes[key];
    var price = '<p class="plan-price"><strong>' + rs(q.amount) + "</strong><span>" + (key === "monthly" ? "per month" : "one-time") + "</span></p>";
    if (q.discount > 0 || q.adjustment > 0) {
      var off = [];
      if (q.discount > 0) off.push(rs(q.discount) + " referral discount");
      if (q.adjustment > 0) off.push("special price");
      price += '<p class="plan-discount"><s>' + rs(q.listPrice) + "</s> · " + off.join(" + ") + " applied</p>";
    }
    var selected = S.purchase && S.purchase.plan === key;
    var disabled = role === "staff" || S.access.phase === "licensed" || S.access.phase === "suspended" || (S.purchase && S.purchase.claimedAt);
    return '<article class="plan-card' + (key === "lifetime" ? " featured" : "") + (selected ? " selected" : "") + '">' +
      (tag ? '<span class="plan-tag">' + esc(tag) + "</span>" : "") +
      "<h3>" + esc(title) + "</h3>" + price + '<p class="plan-blurb">' + esc(blurb) + "</p>" +
      '<ul class="plan-points">' + points.map(function (p) {
        return '<li><svg class="i" aria-hidden="true"><use href="/landing/icons.svg#check-circle"/></svg> ' + esc(p) + "</li>";
      }).join("") + "</ul>" +
      '<button class="btn ' + (key === "lifetime" ? "btn-primary" : "btn-ghost") + ' btn-lg btn-block" type="button" data-plan="' + key + '"' + (disabled ? " disabled" : "") + ">" +
      (selected ? "Continue to payment" : "Choose " + (key === "monthly" ? "monthly" : "one-time")) + "</button></article>";
  }

  function render() {
    var a = S.access;
    $("loading").hidden = true; $("app").hidden = false;
    $("gymLine").textContent = S.gym.name;
    notice(a);
    $("dashLink").hidden = !(a.state === "active");

    var claimed = S.purchase && S.purchase.claimedAt;
    var paying = S.purchase && !claimed && showPay;
    var licensed = a.phase === "licensed";

    $("chooser").hidden = licensed || claimed || paying;
    $("payPanel").hidden = !paying;
    $("verifyCard").hidden = !claimed;

    if (!$("chooser").hidden) {
      var grid = planCard("lifetime", "One-time licence", "Most popular", "Pay once, keep Gymboo for good.", [
        "Desktop, owner and member apps", "Server and maintenance free in year one", "Then ₹1,299 a year"]) +
        planCard("monthly", "Monthly", "", "One simple monthly fee, everything included.", [
          "Licence, apps, server and upkeep included", "No yearly fee", "Cancel any time"]);
      $("planGrid").innerHTML = role === "staff" ? '<p class="plans-sub">Only the gym owner can buy a plan. Ask the owner to open this page.</p>' + grid : grid;
    }

    if (paying) renderPay();
    if (claimed) renderVerify();
  }

  function renderPay() {
    var p = S.purchase, pay = S.payment;
    $("payAmount").textContent = Number(p.amount).toLocaleString("en-IN");
    $("breakdown").innerHTML = breakdownHtml(p);
    $("claimBtn").disabled = !S.upiConfigured;
    if (!S.upiConfigured || !pay) {
      $("qrImg").removeAttribute("src");
      $("upiId").textContent = "Not set up yet";
      $("upiName").textContent = "—";
      $("upiOpen").hidden = true;
      showClaimError("Online payment isn't set up yet. Please email " + S.supportEmail + " and we'll help you right away.");
      return;
    }
    showClaimError("");
    $("qrImg").src = pay.qr;
    $("upiId").textContent = pay.upiId;
    $("upiName").textContent = pay.payeeName;
    $("upiOpen").hidden = false;
    $("upiOpen").href = pay.uri;
  }

  function renderVerify() {
    var a = S.access, p = S.purchase;
    var eligible = a.phase === "expired" && a.graceDaysUsed < a.graceDaysMax;
    var text = "Thanks! We've noted your payment of " + rs(p.amount) + " for the " + (p.plan === "lifetime" ? "one-time licence" : "monthly plan") +
      ". We verify it and confirm your purchase within 24 hours.";
    $("verifyText").textContent = text;
    $("verifyBreakdown").innerHTML = breakdownHtml(p);
    var meta = "";
    if (a.phase === "grace") meta = "You have temporary access until " + when(a.graceUntil) + " (temporary day " + a.graceDaysUsed + " of " + a.graceDaysMax + ").";
    else if (a.phase === "expired" && !eligible) meta = "You've used all " + a.graceDaysMax + " days of temporary access. Your account unlocks as soon as we verify your payment.";
    else if (a.phase === "expired") meta = "Your dashboard is locked until we verify the payment. You can get temporary access for today below (" + (a.graceDaysMax - a.graceDaysUsed) + " left).";
    else if (a.phase === "trial") meta = "You're still in your free trial, so nothing changes until it ends.";
    $("verifyMeta").textContent = meta;
    $("verifyDash").hidden = a.state !== "active";
    $("reclaimBtn").hidden = !eligible;
    $("verifySupport").innerHTML = "Questions or already paid and still locked? Email <a href=\"mailto:" + esc(S.supportEmail) + "\">" + esc(S.supportEmail) + "</a>.";
  }

  function showClaimError(msg) { var n = $("claimError"); n.textContent = msg || ""; n.hidden = !msg; }

  function load() {
    return api("/licence").then(function (data) { S = data; render(); });
  }

  function claim(button) {
    button.disabled = true;
    return api("/licence/claim", { paymentRef: $("payRef").value.trim() }).then(function (r) {
      S = r.status; $("payRef").value = ""; render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(function (e) { showClaimError(e.message); alertInline(e.message); })
      .then(function () { button.disabled = false; });
  }
  function alertInline(msg) { if ($("payPanel").hidden) window.alert(msg); }

  document.addEventListener("click", function (e) {
    var plan = e.target.closest("[data-plan]");
    if (plan) {
      plan.disabled = true;
      api("/licence/purchase", { plan: plan.getAttribute("data-plan") }).then(function (data) { S = data; showPay = true; render(); window.scrollTo({ top: 0 }); })
        .catch(function (err) { window.alert(err.message); plan.disabled = false; });
    }
  });
  $("claimBtn").addEventListener("click", function () { claim(this); });
  $("reclaimBtn").addEventListener("click", function () { claim(this); });
  $("changePlan").addEventListener("click", function () { showPay = false; render(); });
  $("copyUpi").addEventListener("click", function () {
    var b = this, text = $("upiId").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { b.textContent = "Copied"; setTimeout(function () { b.textContent = "Copy"; }, 1500); });
  });
  $("logoutBtn").addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(function () {}).then(function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
      window.location.href = "/login";
    });
  });

  api("/auth/me").then(function (d) { role = (d.user && d.user.role) || ""; }).catch(function () {}).then(load).catch(function (err) {
    $("loading").textContent = err.message || "Could not load your plan.";
  });
})();
