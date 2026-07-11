// Super-admin console. Talks only to /api/super/* (its own cookie-based session).
// Plain vanilla JS, no dependencies — matches the deliberately minimal UI.
(function () {
  "use strict";

  var API = "/api/super";
  var $ = function (id) { return document.getElementById(id); };
  var state = { gyms: [] };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Every call carries the super-admin cookie (same-origin). A non-2xx response
  // surfaces the server's error message.
  function api(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    options.headers = options.headers || {};
    if (options.body && !options.headers["Content-Type"]) {
      options.headers["Content-Type"] = "application/json";
    }
    return fetch(API + path, options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || ("Request failed (" + res.status + ")"));
        return data;
      });
    });
  }

  function showMsg(el, text, kind) {
    el.textContent = text;
    el.className = "msg " + (kind || "error");
    el.hidden = !text;
  }

  function flash(text) {
    var el = $("globalMsg");
    showMsg(el, text, "ok");
    setTimeout(function () { el.hidden = true; }, 4000);
  }

  // ---------- Auth ----------
  function showPanel(who) {
    $("loginView").hidden = true;
    $("panelView").hidden = false;
    $("whoami").textContent = (who && (who.name || who.email)) ? (who.name || who.email) + " " : "";
    refreshAll();
  }

  function showLogin() {
    $("panelView").hidden = true;
    $("loginView").hidden = false;
  }

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var body = JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value });
    api("/login", { method: "POST", body: body }).then(function (data) {
      $("loginPassword").value = "";
      showMsg($("loginError"), "", "error");
      showPanel(data.superAdmin);
    }).catch(function (err) {
      showMsg($("loginError"), err.message, "error");
    });
  });

  $("logoutBtn").addEventListener("click", function () {
    api("/logout", { method: "POST" }).then(showLogin).catch(showLogin);
  });

  // ---------- Gyms ----------
  function renderGyms() {
    var body = $("gymsBody");
    if (!state.gyms.length) {
      body.innerHTML = '<tr><td colspan="4" class="muted">No gyms yet.</td></tr>';
    } else {
      body.innerHTML = state.gyms.map(function (gym) {
        var suspended = gym.status === "suspended";
        var next = suspended ? "active" : "suspended";
        var label = suspended ? "Reactivate" : "Suspend";
        return "<tr>" +
          "<td>" + esc(gym.name) + "</td>" +
          "<td><code>/checkin/" + esc(gym.slug) + "</code></td>" +
          '<td class="status-' + esc(gym.status) + '">' + esc(gym.status) + "</td>" +
          '<td><button class="link" data-gym="' + esc(gym.id) + '" data-status="' + next + '">' + label + "</button></td>" +
          "</tr>";
      }).join("");
    }

    // Populate the "add admin" gym dropdown.
    var select = $("adminGymSelect");
    select.innerHTML = state.gyms.map(function (gym) {
      return '<option value="' + esc(gym.id) + '">' + esc(gym.name) + "</option>";
    }).join("");
  }

  function loadGyms() {
    return api("/gyms").then(function (gyms) {
      state.gyms = gyms || [];
      renderGyms();
    });
  }

  $("gymsBody").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-gym]");
    if (!btn) return;
    var status = btn.getAttribute("data-status");
    if (!confirm("Set this gym to " + status + "?")) return;
    api("/gyms/" + btn.getAttribute("data-gym") + "/status", {
      method: "PATCH", body: JSON.stringify({ status: status }),
    }).then(function () {
      flash("Gym updated.");
      loadGyms();
    }).catch(function (err) { alert(err.message); });
  });

  $("gymForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var body = JSON.stringify({
      gymName: f.gymName.value.trim(),
      adminName: f.adminName.value.trim(),
      adminEmail: f.adminEmail.value.trim(),
      adminPassword: f.adminPassword.value,
    });
    api("/gyms", { method: "POST", body: body }).then(function () {
      showMsg($("gymError"), "", "error");
      f.reset();
      flash("Gym created.");
      return refreshAll();
    }).catch(function (err) { showMsg($("gymError"), err.message, "error"); });
  });

  // ---------- Admin users ----------
  function renderAdmins(admins) {
    var body = $("adminsBody");
    if (!admins.length) {
      body.innerHTML = '<tr><td colspan="6" class="muted">No admin accounts yet.</td></tr>';
      return;
    }
    body.innerHTML = admins.map(function (u) {
      var disabled = u.status === "disabled";
      var next = disabled ? "active" : "disabled";
      var label = disabled ? "Reactivate" : "Suspend";
      return "<tr>" +
        "<td>" + esc(u.gym ? u.gym.name : "—") + "</td>" +
        "<td>" + esc(u.name || "—") + "</td>" +
        "<td>" + esc(u.email) + "</td>" +
        "<td>" + esc(u.role) + "</td>" +
        '<td class="status-' + esc(u.status) + '">' + esc(u.status) + "</td>" +
        '<td><button class="link" data-admin="' + esc(u.id) + '" data-status="' + next + '">' + label + "</button></td>" +
        "</tr>";
    }).join("");
  }

  function loadAdmins() {
    return api("/admins").then(renderAdmins);
  }

  $("adminsBody").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-admin]");
    if (!btn) return;
    var status = btn.getAttribute("data-status");
    var verb = status === "disabled" ? "suspend" : "reactivate";
    if (!confirm("Are you sure you want to " + verb + " this admin account?")) return;
    api("/admins/" + btn.getAttribute("data-admin") + "/status", {
      method: "PATCH", body: JSON.stringify({ status: status }),
    }).then(function () {
      flash("Admin account " + (status === "disabled" ? "suspended" : "reactivated") + ".");
      loadAdmins();
    }).catch(function (err) { alert(err.message); });
  });

  $("adminForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target;
    var body = JSON.stringify({
      tenantId: f.tenantId.value,
      name: f.name.value.trim(),
      email: f.email.value.trim(),
      password: f.password.value,
      role: f.role.value,
    });
    api("/admins", { method: "POST", body: body }).then(function () {
      showMsg($("adminError"), "", "error");
      f.reset();
      flash("Admin user added.");
      loadAdmins();
    }).catch(function (err) { showMsg($("adminError"), err.message, "error"); });
  });

  // ---------- Boot ----------
  function refreshAll() {
    return Promise.all([loadGyms(), loadAdmins()]);
  }

  // Resume an existing super-admin session if the cookie is still valid.
  api("/me").then(function (data) {
    showPanel(data.superAdmin);
  }).catch(function () {
    showLogin();
  });
})();
