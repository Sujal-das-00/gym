// Gymboo super-admin console. Talks only to /api/super/* (its own cookie session).
// Vanilla JS, no dependencies. One hash route per page; data is loaded once and
// re-fetched after every change so counts and tables never drift apart.
(function () {
  "use strict";

  var API = "/api/super";
  var $ = function (id) { return document.getElementById(id); };
  var state = { overview: null, gyms: [], admins: [], purchases: [], partners: [], payouts: [], reviews: [] };
  var filters = { gyms: { q: "", f: "all" }, admins: { q: "", f: "all" }, purchases: { q: "", f: "pending" },
    partners: { q: "", f: "all" }, payouts: { q: "", f: "requested" }, reviews: { q: "", f: "pending" } };
  var settingsState = { upiId: "", upiName: "" };
  var page = "overview";

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rs(n) { return "₹" + Number(n || 0).toLocaleString("en-IN"); }
  function date(v) { return v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
  function datetime(v) { return v ? new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—"; }

  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    if (options.body && typeof options.body !== "string") options.body = JSON.stringify(options.body);
    if (options.body) options.headers["Content-Type"] = "application/json";
    return fetch(API + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.error || "Request failed (" + res.status + ")"); e.status = res.status; throw e; }
        return data;
      });
    });
  }

  var toastTimer;
  function toast(text, bad) {
    var el = $("toast");
    el.textContent = text; el.className = bad ? "bad" : ""; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3800);
  }
  // A 401 only means "signed out" if the session itself is gone. A server still running
  // older code answers 401 for routes it doesn't have yet (they fall through to the
  // gym-admin auth wall), and that must not look like a failed login.
  function fail(err) {
    if (err.status !== 401) return toast(err.message, true);
    api("/me").then(function () {
      toast("You're signed in, but the server is running an older version. Restart the backend (npm run dev / redeploy) and refresh.", true);
    }).catch(showLogin);
  }
  function inlineError(id, text) { var el = $(id); el.textContent = text || ""; el.hidden = !text; }

  // ---------- Auth ----------
  function showLogin() { $("appView").hidden = true; $("loginView").hidden = false; }
  function showApp(who) {
    $("loginView").hidden = true; $("appView").hidden = false;
    $("whoami").textContent = (who && (who.name || who.email)) || "Super admin";
    route();
    refresh();
  }
  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    api("/login", { method: "POST", body: { email: $("loginEmail").value, password: $("loginPassword").value } }).then(function (d) {
      $("loginPassword").value = ""; inlineError("loginError", ""); showApp(d.superAdmin);
    }).catch(function (err) { inlineError("loginError", err.message); });
  });
  $("logoutBtn").addEventListener("click", function () { api("/logout", { method: "POST" }).then(showLogin, showLogin); });

  // ---------- Data ----------
  function refresh() {
    return Promise.all([
      api("/overview"), api("/gyms"), api("/admins"), api("/purchases"), api("/partners"), api("/payouts"), api("/reviews"), api("/settings"),
    ]).then(function (r) {
      settingsState = r[7] || settingsState;
      state.overview = r[0]; state.gyms = r[1] || []; state.admins = r[2] || []; state.purchases = r[3] || [];
      state.partners = r[4] || []; state.payouts = r[5] || []; state.reviews = r[6] || [];
      updateCounts();
      render();
    }).catch(fail);
  }

  function updateCounts() {
    var c = {
      purchases: state.purchases.filter(function (p) { return p.status === "pending"; }).length,
      payouts: state.payouts.filter(function (p) { return p.status === "requested"; }).length,
      reviews: state.reviews.filter(function (p) { return p.status === "pending"; }).length,
      gyms: state.gyms.filter(function (g) { return g.state === "trial_expired"; }).length,
    };
    Array.prototype.forEach.call(document.querySelectorAll("[data-count]"), function (el) {
      var n = c[el.getAttribute("data-count")] || 0;
      el.textContent = n; el.hidden = !n;
    });
    var opts = state.gyms.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.name) + "</option>"; }).join("");
    Array.prototype.forEach.call(document.querySelectorAll("select[data-gyms]"), function (s) { s.innerHTML = opts; });
  }

  // ---------- Routing ----------
  var PAGES = {
    overview: { title: "Overview", sub: "How the platform is doing right now." },
    gyms: { title: "Gyms", sub: "Every gym on the platform." },
    admins: { title: "Admin accounts", sub: "Owner and staff logins across all gyms." },
    purchases: { title: "Licence purchases", sub: "Approve a one-time purchase to make a referral successful." },
    partners: { title: "Referral partners", sub: "People earning from the referral programme." },
    payouts: { title: "Payout requests", sub: "Partners are told these settle within 24 hours." },
    reviews: { title: "Reviews", sub: "Submitted from the website's “Give a review” form." },
    settings: { title: "Payment settings", sub: "Where gym owners pay for their licence." },
  };
  function route() {
    // "#gyms/expired" opens the gyms page with that filter already applied.
    var parts = (location.hash || "#overview").slice(1).split("/");
    page = PAGES[parts[0]] ? parts[0] : "overview";
    if (parts[1] && filters[page]) filters[page].f = parts[1];
    Array.prototype.forEach.call(document.querySelectorAll("#nav a"), function (a) { a.classList.toggle("on", a.getAttribute("data-page") === page); });
    $("side").classList.remove("open");
    render();
  }
  window.addEventListener("hashchange", route);
  $("menuBtn").addEventListener("click", function () { $("side").classList.toggle("open"); });

  // ---------- Shared pieces ----------
  function chips(list, current) {
    return '<div class="chips">' + list.map(function (c) {
      return '<button type="button" class="chip' + (c[0] === current ? " on" : "") + '" data-chip="' + c[0] + '">' + esc(c[1]) + "</button>";
    }).join("") + "</div>";
  }
  function toolbar(key, chipList, placeholder) {
    var f = filters[key];
    return '<div class="toolbar"><input class="search" id="search" type="search" placeholder="' + esc(placeholder || "Search…") + '" value="' + esc(f.q) + '" />' +
      (chipList ? chips(chipList, f.f) : "") + "</div>";
  }
  function table(heads, rows, emptyText) {
    if (!rows.length) return '<div class="card"><div class="empty">' + esc(emptyText) + "</div></div>";
    return '<div class="card tbl-wrap"><table><thead><tr>' + heads.map(function (h) {
      return "<th" + (h.charAt(0) === ">" ? ' class="num"' : "") + ">" + esc(h.replace(/^>/, "")) + "</th>";
    }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
  }
  function badge(text, tone) { return '<span class="badge ' + (tone || "") + '">' + esc(text) + "</span>"; }
  function matches(q, parts) {
    q = q.trim().toLowerCase();
    return !q || parts.join(" ").toLowerCase().indexOf(q) !== -1;
  }
  function statusTone(s) { return { active: "green", approved: "green", paid: "green", successful: "green", pending: "gold", requested: "gold", suspended: "red", disabled: "red", rejected: "red" }[s] || ""; }

  // ---------- Pages ----------
  function actionsFor(key) {
    var a = {
      gyms: '<button class="btn primary" data-open="gymDlg">+ New gym</button>',
      admins: '<button class="btn primary" data-open="adminDlg">+ Add admin</button>',
      purchases: '<button class="btn primary" data-open="purchaseDlg">+ Record purchase</button>',
    };
    return a[key] || "";
  }

  function pageOverview() {
    var o = state.overview;
    if (!o) return '<div class="empty">Loading…</div>';
    var stat = function (label, value, sub, warn) {
      return '<div class="card stat' + (warn ? " warn" : "") + '"><span>' + label + "</span><strong>" + value + "</strong><small>" + sub + "</small></div>";
    };
    var items = [];
    if (o.trials.expired) items.push(['#gyms/trial_expired', o.trials.expired + " gym" + (o.trials.expired > 1 ? "s are" : " is") + " locked out after the free trial", "View"]);
    if (o.trials.onGrace) items.push(['#gyms/active', o.trials.onGrace + " gym" + (o.trials.onGrace > 1 ? "s are" : " is") + " on temporary access, waiting for payment verification", "View"]);
    if (o.purchases.pending) items.push(['#purchases', o.purchases.pending + " licence purchase" + (o.purchases.pending > 1 ? "s" : "") + " awaiting approval", "Review"]);
    if (o.payouts.pending) items.push(['#payouts', o.payouts.pending + " payout request" + (o.payouts.pending > 1 ? "s" : "") + " · " + rs(o.payouts.pendingAmount), "Settle"]);
    if (o.reviews.pending) items.push(['#reviews', o.reviews.pending + " new review" + (o.reviews.pending > 1 ? "s" : "") + " to moderate", "Read"]);
    return '<div class="stats">' +
      stat("Gyms", o.gyms.total, o.gyms.active + " active") +
      stat("On free trial", o.trials.onTrial, "no licence yet") +
      stat("Temporary access", o.trials.onGrace, "trial over, payment unverified") +
      stat("Trial expired", o.trials.expired, "locked out until they pay", o.trials.expired > 0) +
      stat("Members", Number(o.members).toLocaleString("en-IN"), "across all gyms") +
      stat("Licence revenue", rs(o.purchases.revenue), o.purchases.lifetime + " one-time licence" + (o.purchases.lifetime === 1 ? "" : "s") + " sold") +
      stat("Partners", o.partners.total, o.partners.successfulReferrals + " successful referral" + (o.partners.successfulReferrals === 1 ? "" : "s")) +
      stat("Partner earnings", rs(o.partners.earned), rs(o.payouts.paid) + " already paid out") +
      stat("Reviews", o.reviews.total, o.reviews.pending + " pending", o.reviews.pending > 0) +
      "</div>" +
      '<div class="card attn"><h2>Needs your attention</h2>' + (items.length ? items.map(function (i) {
        return '<a href="' + i[0] + '"><span>' + esc(i[1]) + '</span><span class="badge gold">' + i[2] + " →</span></a>";
      }).join("") : '<p class="ok">You’re all caught up. Nothing is waiting on you.</p>') + "</div>";
  }

  function pageGyms() {
    return toolbar("gyms", [["all", "All"], ["active", "Active"], ["trial_expired", "Trial expired"], ["suspended", "Suspended"]], "Search gyms or owners…") + '<div id="results"></div>';
  }
  // The Free plan column: where the gym is on its trial, worked out from the raw numbers so
  // it still reads sensibly for a suspended gym.
  function trialCell(g) {
    var claimed = g.paymentClaimed ? ' <span class="badge indigo">Payment claimed</span>' : "";
    if (g.licence) return badge("Licensed", "green") + '<span class="trial">Out of trial</span>' + claimed;
    var days = g.daysOnFree + " day" + (g.daysOnFree === 1 ? "" : "s") + " on free plan";
    if (g.daysLeft < 0 && g.graceActive) {
      return badge("Temp access · day " + g.graceDaysUsed + " of " + g.graceDaysMax, "gold") + claimed +
        '<span class="trial">until ' + datetime(g.graceUntil) + " · " + g.daysOver + " day" + (g.daysOver === 1 ? "" : "s") + " past trial</span>";
    }
    if (g.daysLeft < 0) {
      return badge("Trial over", "red") + claimed + '<span class="trial">' + days + " · " + g.daysOver + " day" + (g.daysOver === 1 ? "" : "s") +
        " over · temp access " + g.graceDaysUsed + " of " + g.graceDaysMax + " used</span>";
    }
    var left = g.daysLeft === 0 ? "ends today" : g.daysLeft + " day" + (g.daysLeft === 1 ? "" : "s") + " left";
    return badge("On trial · " + left, g.daysLeft <= 2 ? "gold" : "indigo") + claimed + '<span class="trial">' + days + " of " + g.trialDays + "</span>";
  }
  var STATE_LABEL = { active: "Active", trial_expired: "Trial expired", suspended: "Suspended" };
  var STATE_TONE = { active: "green", trial_expired: "red", suspended: "red" };
  function maintCell(g) {
    var m = g.maintenance;
    if (!m || !m.applicable) return "";
    var label = m.status === "overdue" ? (m.locked ? "ON HOLD, was due" : "overdue, was due") : m.status === "due" ? "expired, pay by" : "next due";
    return '<span class="sub">Maintenance ' + rs(m.amount) + (m.customPrice ? " (custom)" : "") + " · " + label + " " + date(m.status === "upcoming" ? m.windowStart : m.dueBy) + (m.customDate ? " (custom date)" : "") + "</span>";
  }
  function resultsGyms() {
    var f = filters.gyms;
    var rows = state.gyms.filter(function (g) {
      var ok = f.f === "all" || g.state === f.f;
      return ok && matches(f.q, [g.name, g.slug, g.ownerEmail, g.referredBy, g.referralCode]);
    }).map(function (g) {
      var next = g.status === "suspended" ? "active" : "suspended";
      return "<tr><td><strong>" + esc(g.name) + '</strong><span class="sub">' + esc(g.ownerEmail || "No owner") + "</span></td>" +
        "<td>" + date(g.registeredOn) + '<span class="sub">' + (g.daysOnFree === 0 ? "today" : g.daysOnFree + " days ago") + "</span></td>" +
        "<td>" + trialCell(g) + "</td>" +
        '<td class="num">' + g.memberCount + "</td>" +
        "<td>" + (g.licence ? badge(g.licence === "lifetime" ? "Lifetime License" : "Monthly Subscription", "green") : badge("Free Plan")) +
        (g.priceOverride != null ? '<span class="sub">Special price ' + rs(g.priceOverride) + "</span>" : "") + maintCell(g) + "</td>" +
        "<td>" + (g.referralCode ? "<code>" + esc(g.referralCode) + '</code><span class="sub">' + esc(g.referredBy || "") + (g.referralStatus === "successful" ? " · rewarded" : "") + "</span>" : "—") + "</td>" +
        "<td>" + badge(STATE_LABEL[g.state] || g.state, STATE_TONE[g.state]) + "</td>" +
        '<td class="actions"><button class="btn sm" data-act="gym-edit" data-id="' + esc(g.id) + '">Edit</button>' +
        (g.maintenance && g.maintenance.applicable ? '<button class="btn sm" data-act="gym-maint" data-id="' + esc(g.id) + '">Maintenance paid</button>' : "") +
        '<button class="btn sm' + (next === "suspended" ? " danger" : "") + '" data-act="gym-status" data-id="' + esc(g.id) + '" data-status="' + next + '">' +
        (next === "suspended" ? "Suspend" : "Reactivate") + "</button></td></tr>";
    });
    return table(["Gym", "Registered", "Free plan", ">Members", "Licence", "Promo code", "Status", ""], rows, "No gyms match.");
  }

  function pageAdmins() {
    return toolbar("admins", [["all", "All"], ["gym_admin", "Owners"], ["staff", "Staff"], ["disabled", "Suspended"]], "Search by email, name or gym…") + '<div id="results"></div>';
  }
  function resultsAdmins() {
    var f = filters.admins;
    var rows = state.admins.filter(function (u) {
      var ok = f.f === "all" || u.role === f.f || (f.f === "disabled" && u.status === "disabled");
      return ok && matches(f.q, [u.email, u.name, u.gym && u.gym.name]);
    }).map(function (u) {
      var next = u.status === "disabled" ? "active" : "disabled";
      return "<tr><td><strong>" + esc(u.name || u.email) + '</strong><span class="sub">' + (u.name ? esc(u.email) : "") + "</span></td>" +
        "<td>" + esc(u.gym ? u.gym.name : "—") + "</td><td>" + badge(u.role === "gym_admin" ? "Owner" : "Staff", u.role === "gym_admin" ? "indigo" : "") + "</td>" +
        "<td>" + datetime(u.lastLoginAt) + "</td><td>" + badge(u.status === "disabled" ? "suspended" : u.status, statusTone(u.status)) + "</td>" +
        '<td class="actions"><button class="btn sm' + (next === "disabled" ? " danger" : "") + '" data-act="admin-status" data-id="' + esc(u.id) + '" data-status="' + next + '">' +
        (next === "disabled" ? "Suspend" : "Reactivate") + "</button></td></tr>";
    });
    return table(["User", "Gym", "Role", "Last login", "Status", ""], rows, "No accounts match.");
  }

  function pagePurchases() {
    return toolbar("purchases", [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]], "Search gyms or partners…") + '<div id="results"></div>';
  }
  // "Payment claimed" = the owner says they paid by UPI and is waiting for you to verify it.
  function purchaseStatus(p) {
    if (p.status !== "pending") return badge(p.status, statusTone(p.status));
    if (!p.claimedAt) return badge("Awaiting payment", "gold");
    return badge("Payment claimed", "indigo") + '<span class="sub">' + datetime(p.claimedAt) + (p.paymentRef ? " · UTR " + esc(p.paymentRef) : "") + "</span>";
  }
  function resultsPurchases() {
    var f = filters.purchases;
    var rows = state.purchases.filter(function (p) {
      return (f.f === "all" || p.status === f.f) && matches(f.q, [p.gymName, p.referredBy]);
    }).map(function (p) {
      var acts = p.status === "pending"
        ? '<button class="btn sm primary" data-act="buy-approve" data-id="' + esc(p.id) + '">Approve</button><button class="btn sm danger" data-act="buy-reject" data-id="' + esc(p.id) + '">Reject</button>'
        : esc(p.note || "");
      return "<tr><td><strong>" + esc(p.gymName) + '</strong><span class="sub">' + datetime(p.createdAt) + "</span></td>" +
        "<td>" + badge(p.plan === "lifetime" ? "One-time" : "Monthly", p.plan === "lifetime" ? "indigo" : "") + "</td>" +
        '<td class="num">' + rs(p.listPrice) + '</td><td class="num">' + ((p.discount + p.adjustment) ? "−" + rs(p.discount + p.adjustment) + (p.adjustment ? '<span class="sub">incl. special price</span>' : "") : "—") + '</td><td class="num"><strong>' + rs(p.amount) + "</strong></td>" +
        "<td>" + esc(p.referredBy || "—") + "</td><td>" + purchaseStatus(p) + '</td><td class="actions">' + acts + "</td></tr>";
    });
    return table(["Gym", "Plan", ">Price", ">Discount", ">To collect", "Referred by", "Status", ""], rows, "No purchases here.");
  }

  function pagePartners() { return toolbar("partners", null, "Search partners or codes…") + '<div id="results"></div>'; }
  function resultsPartners() {
    var f = filters.partners;
    var rows = state.partners.filter(function (p) { return matches(f.q, [p.name, p.email, p.phone, p.referralCode]); }).map(function (p) {
      return "<tr><td><strong>" + esc(p.name) + '</strong><span class="sub">' + esc(p.email) + " · " + esc(p.phone) + "</span></td>" +
        "<td><code>" + esc(p.referralCode) + "</code></td>" +
        '<td class="num">' + p.totalReferrals + '</td><td class="num">' + p.successfulReferrals + '</td>' +
        '<td class="num">' + rs(p.earned) + '</td><td class="num">' + rs(p.paidOut) + '</td><td class="num"><strong>' + rs(p.available) + "</strong></td><td>" + date(p.createdAt) + "</td></tr>";
    });
    return table(["Partner", "Code", ">Referrals", ">Successful", ">Earned", ">Paid out", ">Owed now", "Joined"], rows, "No partners yet.");
  }

  function pagePayouts() {
    return toolbar("payouts", [["requested", "To pay"], ["paid", "Paid"], ["rejected", "Rejected"], ["all", "All"]], "Search partners…") + '<div id="results"></div>';
  }
  function resultsPayouts() {
    var f = filters.payouts;
    var rows = state.payouts.filter(function (p) {
      return (f.f === "all" || p.status === f.f) && matches(f.q, [p.partnerName, p.partnerEmail, p.payoutDetails]);
    }).map(function (p) {
      var acts = p.status === "requested"
        ? '<button class="btn sm primary" data-act="pay-paid" data-id="' + esc(p.id) + '">Mark paid</button><button class="btn sm danger" data-act="pay-rejected" data-id="' + esc(p.id) + '">Reject</button>'
        : esc(p.note || "");
      return "<tr><td>" + datetime(p.requestedAt) + "</td><td><strong>" + esc(p.partnerName) + '</strong><span class="sub">' + esc(p.partnerEmail) + "</span></td>" +
        '<td class="num"><strong>' + rs(p.amount) + "</strong></td><td><code>" + esc(p.payoutDetails) + "</code></td>" +
        "<td>" + badge(p.status === "requested" ? "to pay" : p.status, statusTone(p.status)) + '</td><td class="actions">' + acts + "</td></tr>";
    });
    return table(["Requested", "Partner", ">Amount", "Pay to", "Status", ""], rows, "No payout requests here.");
  }

  function pageReviews() {
    var n = state.reviews.length;
    return '<div class="hint">Approving a review only marks it as vetted. To show it on the website, add it to <code>landing/testimonials.js</code>.</div>' +
      toolbar("reviews", [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All (" + n + ")"]], "Search reviews…") + '<div id="results"></div>';
  }
  function resultsReviews() {
    var f = filters.reviews;
    var list = state.reviews.filter(function (r) { return (f.f === "all" || r.status === f.f) && matches(f.q, [r.name, r.gymName, r.message]); });
    if (!list.length) return '<div class="card"><div class="empty">No reviews here.</div></div>';
    return '<div class="reviews">' + list.map(function (r) {
      var acts = "";
      if (r.status !== "approved") acts += '<button class="btn sm primary" data-act="rev-approved" data-id="' + esc(r.id) + '">Approve</button>';
      if (r.status !== "rejected") acts += '<button class="btn sm" data-act="rev-rejected" data-id="' + esc(r.id) + '">Reject</button>';
      acts += '<button class="btn sm danger" data-act="rev-delete" data-id="' + esc(r.id) + '">Delete</button>';
      return '<article class="card review"><header><div class="avatar">' + esc((r.name || "?").charAt(0).toUpperCase()) + "</div>" +
        "<div><strong>" + esc(r.name) + "</strong><small>" + esc(r.gymName) + " · " + date(r.createdAt) + "</small></div>" +
        badge(r.status, statusTone(r.status)) + "</header><blockquote>" + esc(r.message) + '</blockquote><footer><span></span><div class="row">' + acts + "</div></footer></article>";
    }).join("") + "</div>";
  }

  function pageSettings() {
    return '<div class="card" style="max-width:520px;padding:22px"><form id="settingsForm" autocomplete="off">' +
      '<div class="err" id="settingsError" hidden></div>' +
      '<label class="f"><span>UPI ID</span><input name="upiId" value="' + esc(settingsState.upiId) + '" placeholder="name@bank" required /></label>' +
      '<label class="f"><span>Payee name shown in the UPI app</span><input name="upiName" value="' + esc(settingsState.upiName) + '" maxlength="60" /></label>' +
      '<p class="muted-note">Gym owners whose trial has ended pay on the plans page by scanning a QR built from this UPI ID, with the amount filled in. Change it here any time. It applies to the next QR shown.</p>' +
      (settingsState.upiId ? "" : '<p class="warn-note">No UPI ID is set yet, so owners can\'t see payment details.</p>') +
      '<button class="btn primary" type="submit">Save</button></form></div>' + pageMaintSettings();
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function mdPicker(name, value) {
    var parts = String(value || "01-01").split("-"), month = Number(parts[0]), day = Number(parts[1]);
    var months = MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === month ? " selected" : "") + ">" + m + "</option>"; }).join("");
    var days = ""; for (var d = 1; d <= 31; d++) days += '<option value="' + d + '"' + (d === day ? " selected" : "") + ">" + d + "</option>";
    return '<div class="two"><select name="' + name + 'Day">' + days + '</select><select name="' + name + 'Month">' + months + "</select></div>";
  }
  function pageMaintSettings() {
    var m = settingsState.maintenance || { price: 0, start: "01-01", end: "01-15" };
    return '<div class="card" style="max-width:520px;padding:22px;margin-top:16px"><form id="maintSettingsForm" autocomplete="off">' +
      '<h3 style="margin:0 0 10px">Yearly server &amp; maintenance (default)</h3><div class="err" id="maintSettingsError" hidden></div>' +
      '<label class="f"><span>Yearly price, ₹</span><input name="price" type="number" min="1" max="1000000" step="0.01" value="' + esc(m.price) + '" required /></label>' +
      '<div class="f"><span>Due window, first day</span>' + mdPicker("start", m.start) + "</div>" +
      '<div class="f"><span>Due window, last day</span>' + mdPicker("end", m.end) + "</div>" +
      '<p class="muted-note">Applies to every Lifetime License gym that has no custom price or due date of its own. Set those per gym with Edit gym. Changing this moves the dates shown to owners straight away.</p>' +
      '<button class="btn primary" type="submit">Save defaults</button></form></div>';
  }
  var PAGE_FN = { overview: pageOverview, gyms: pageGyms, admins: pageAdmins, purchases: pagePurchases, partners: pagePartners, payouts: pagePayouts, reviews: pageReviews, settings: pageSettings };
  var RESULT_FN = { gyms: resultsGyms, admins: resultsAdmins, purchases: resultsPurchases, partners: resultsPartners, payouts: resultsPayouts, reviews: resultsReviews };

  function render() {
    if ($("appView").hidden) return;
    $("pageTitle").textContent = PAGES[page].title;
    $("pageSub").textContent = PAGES[page].sub;
    $("pageActions").innerHTML = actionsFor(page);
    $("page").innerHTML = PAGE_FN[page]();
    renderResults();
  }
  function renderResults() {
    var box = $("results");
    if (box && RESULT_FN[page]) box.innerHTML = RESULT_FN[page]();
  }

  // ---------- Events ----------
  document.addEventListener("input", function (e) {
    if (e.target.id !== "search") return;
    filters[page].q = e.target.value; renderResults();
  });

  // A small promise-based dialog for the optional note on reject / mark-paid.
  function askNote(title, label, okText) {
    return new Promise(function (resolve) {
      var dlg = $("noteDlg"), done = false;
      $("noteTitle").textContent = title; $("noteLabel").innerHTML = label; $("noteOk").textContent = okText; $("noteInput").value = "";
      function finish(v) { if (done) return; done = true; dlg.close(); resolve(v); }
      $("noteForm").onsubmit = function (e) { e.preventDefault(); finish($("noteInput").value.trim()); };
      dlg.onclose = function () { finish(null); };
      dlg.showModal(); $("noteInput").focus();
    });
  }

  function done(msg) { toast(msg); return refresh(); }

  var ACTIONS = {
    "gym-edit": function (b) {
      var g = state.gyms.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
      if (!g) return;
      var f = $("editGymForm");
      f.id.value = g.id; f.name.value = g.name; f.slug.value = g.slug; f.registeredOn.value = g.registeredOn || "";
      f.trialDays.value = g.trialDays; f.status.value = g.status; f.graceDaysUsed.value = g.graceDaysUsed;
      f.priceOverride.value = g.priceOverride == null ? "" : g.priceOverride;
      f.maintenancePrice.value = g.maintenancePrice == null ? "" : g.maintenancePrice;
      f.maintenanceDue.value = g.maintenanceDue || "";
      var rewarded = g.referralStatus === "successful";
      f.referralCode.value = g.referralCode || ""; f.referralCode.disabled = rewarded;
      $("refHint").textContent = rewarded ? "(already rewarded, locked)" : "(leave empty for none)";
      $("editGymInfo").textContent = g.licence ? "This gym holds a licence, so the trial no longer applies." :
        g.daysOnFree + " days on the free plan so far. Raise the trial days to extend it, or lower the temporary access count to give more days.";
      inlineError("editGymError", "");
      $("editGymDlg").showModal();
    },
    "gym-maint": function (b) {
      var g = state.gyms.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
      if (!g || !g.maintenance || !g.maintenance.applicable) return;
      var m = g.maintenance, f = $("maintForm");
      f.id.value = g.id; f.amount.value = m.amount; f.paidOn.value = new Date().toISOString().slice(0, 10);
      f.ref.value = ""; f.nextDue.value = "";
      $("maintInfo").textContent = g.name + ": " + "window " + date(m.windowStart) + " to " + date(m.dueBy) +
        ". Recording this settles " + m.periodYear + (m.customDate ? " and moves the due date forward a year." : ".");
      inlineError("maintError", "");
      $("maintDlg").showModal();
    },
    "gym-status": function (b) {
      var s = b.getAttribute("data-status");
      if (!confirm("Set this gym to " + s + "?")) return;
      api("/gyms/" + b.getAttribute("data-id") + "/status", { method: "PATCH", body: { status: s } }).then(function () { return done("Gym updated."); }).catch(fail);
    },
    "admin-status": function (b) {
      var s = b.getAttribute("data-status");
      if (!confirm("Are you sure you want to " + (s === "disabled" ? "suspend" : "reactivate") + " this account?")) return;
      api("/admins/" + b.getAttribute("data-id") + "/status", { method: "PATCH", body: { status: s } }).then(function () { return done("Account updated."); }).catch(fail);
    },
    "buy-approve": function (b) {
      var pur = state.purchases.filter(function (x) { return x.id === b.getAttribute("data-id"); })[0];
      if (!confirm("Approve this purchase" + (pur ? " (expected payment " + rs(pur.amount) + (pur.claimedAt ? "" : ", but the owner hasn't said they paid") + ")" : "") +
        "? Make sure the money has arrived. A referred gym's partner is credited.")) return;
      api("/purchases/" + b.getAttribute("data-id") + "/approve", { method: "POST" }).then(function () { return done("Purchase approved."); }).catch(fail);
    },
    "buy-reject": function (b) {
      askNote("Reject purchase", "Reason <em>(optional)</em>", "Reject").then(function (note) {
        if (note === null) return;
        return api("/purchases/" + b.getAttribute("data-id") + "/reject", { method: "POST", body: { note: note } }).then(function () { return done("Purchase rejected."); });
      }).catch(fail);
    },
    "pay-paid": function (b) { settle(b, "paid", "Mark payout as paid", "Payment reference <em>(optional)</em>", "Mark paid"); },
    "pay-rejected": function (b) { settle(b, "rejected", "Reject payout", "Reason <em>(optional)</em>", "Reject"); },
    "rev-approved": function (b) { review(b, "approved"); },
    "rev-rejected": function (b) { review(b, "rejected"); },
    "rev-delete": function (b) {
      if (!confirm("Delete this review permanently?")) return;
      api("/reviews/" + b.getAttribute("data-id"), { method: "DELETE" }).then(function () { return done("Review deleted."); }).catch(fail);
    },
  };
  function settle(b, status, title, label, ok) {
    askNote(title, label, ok).then(function (note) {
      if (note === null) return;
      return api("/payouts/" + b.getAttribute("data-id") + "/settle", { method: "POST", body: { status: status, note: note } })
        .then(function () { return done("Payout marked " + status + "."); });
    }).catch(fail);
  }
  function review(b, status) {
    api("/reviews/" + b.getAttribute("data-id"), { method: "PATCH", body: { status: status } }).then(function () { return done("Review " + status + "."); }).catch(fail);
  }

  document.addEventListener("click", function (e) {
    var open = e.target.closest("[data-open]");
    if (open) {
      var f = $(open.getAttribute("data-open")); f.querySelector("form").reset(); f.querySelectorAll(".err").forEach(function (x) { x.hidden = true; });
      var rd = f.querySelector("input[name=registeredOn]");
      if (rd) { var t = new Date(); rd.value = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); rd.max = rd.value; }
      f.showModal(); return;
    }
    var close = e.target.closest("[data-close]");
    if (close) { close.closest("dialog").close(); return; }
    var chip = e.target.closest("[data-chip]");
    if (chip) { filters[page].f = chip.getAttribute("data-chip"); render(); return; }
    var act = e.target.closest("[data-act]");
    if (act && ACTIONS[act.getAttribute("data-act")]) ACTIONS[act.getAttribute("data-act")](act);
  });
  Array.prototype.forEach.call(document.querySelectorAll("dialog"), function (d) {
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
  });

  function submitForm(formId, errId, dlgId, path, bodyFn, okMsg) {
    $(formId).addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target, btn = f.querySelector("button[type=submit]");
      btn.disabled = true;
      api(path, { method: "POST", body: bodyFn(f) }).then(function () {
        $(dlgId).close(); return done(okMsg);
      }).catch(function (err) { if (err.status === 401) return fail(err); inlineError(errId, err.message); })
        .then(function () { btn.disabled = false; });
    });
  }
  submitForm("gymForm", "gymError", "gymDlg", "/gyms", function (f) {
    return { gymName: f.gymName.value.trim(), adminName: f.adminName.value.trim(), adminEmail: f.adminEmail.value.trim(), adminPassword: f.adminPassword.value, referralCode: f.referralCode.value.trim(), registeredOn: f.registeredOn.value, trialDays: f.trialDays.value };
  }, "Gym created.");
  submitForm("adminForm", "adminError", "adminDlg", "/admins", function (f) {
    return { tenantId: f.tenantId.value, name: f.name.value.trim(), email: f.email.value.trim(), password: f.password.value, role: f.role.value };
  }, "Admin added.");
  submitForm("purchaseForm", "purchaseError", "purchaseDlg", "/purchases", function (f) {
    return { tenantId: f.tenantId.value, plan: f.plan.value };
  }, "Purchase recorded. Approve it once payment has cleared.");

  $("maintForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    api("/gyms/" + f.id.value + "/maintenance", { method: "POST", body: { amount: f.amount.value, paidOn: f.paidOn.value, mode: f.mode.value, ref: f.ref.value.trim(), nextDue: f.nextDue.value } })
      .then(function () { $("maintDlg").close(); return done("Maintenance payment recorded."); })
      .catch(function (err) { if (err.status === 401) return fail(err); inlineError("maintError", err.message); })
      .then(function () { btn.disabled = false; });
  });

  $("editGymForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    api("/gyms/" + f.id.value, { method: "PATCH", body: {
      name: f.name.value.trim(), slug: f.slug.value.trim(), registeredOn: f.registeredOn.value, trialDays: f.trialDays.value, status: f.status.value,
      graceDaysUsed: f.graceDaysUsed.value, priceOverride: f.priceOverride.value.trim(),
      maintenancePrice: f.maintenancePrice.value.trim(), maintenanceDue: f.maintenanceDue.value, referralCode: f.referralCode.disabled ? undefined : f.referralCode.value.trim(),
    } }).then(function () { $("editGymDlg").close(); return done("Gym updated."); })
      .catch(function (err) { if (err.status === 401) return fail(err); inlineError("editGymError", err.message); })
      .then(function () { btn.disabled = false; });
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "maintSettingsForm") return;
    e.preventDefault();
    var f = e.target, p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    var md = function (k) { return p2(Number(f[k + "Month"].value)) + "-" + p2(Number(f[k + "Day"].value)); };
    api("/settings/maintenance", { method: "PUT", body: { price: f.price.value, start: md("start"), end: md("end") } }).then(function (d) {
      settingsState.maintenance = d.maintenance; toast("Maintenance defaults saved."); return refresh();
    }).catch(function (err) { if (err.status === 401) return fail(err); inlineError("maintSettingsError", err.message); });
  });

  document.addEventListener("submit", function (e) {
    if (e.target.id !== "settingsForm") return;
    e.preventDefault();
    var f = e.target;
    api("/settings", { method: "PUT", body: { upiId: f.upiId.value.trim(), upiName: f.upiName.value.trim() } }).then(function (d) {
      settingsState.upiId = d.upiId; settingsState.upiName = d.upiName; toast("Payment settings saved."); render();
    }).catch(function (err) { if (err.status === 401) return fail(err); inlineError("settingsError", err.message); });
  });

  // Resume an existing session if the cookie is still valid.
  api("/me").then(function (d) { showApp(d.superAdmin); }).catch(showLogin);
})();
