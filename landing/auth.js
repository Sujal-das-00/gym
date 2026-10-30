// Login and signup for the public site. Both post to the same /api/auth/* routes
// the dashboard uses and hand the session over via the httpOnly cookie plus the
// Bearer token the admin app reads from localStorage. Every rule checked here is
// enforced again in backend/src/services/authService.js. These checks exist for
// instant, precise feedback, never as the only line of defence.
(function () {
  "use strict";

  var TOKEN_KEY = "gym-admin-token"; // same key admin-frontend reads
  var $ = function (id) { return document.getElementById(id); };

  // Names: letters and single spaces only, the rule the admin forms use.
  var NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
  var NAME_MAX = 30;
  var EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  var EMAIL_MAX = 120;

  function sanitizeName(value) {
    return String(value || "").replace(/[^A-Za-z ]+/g, "").replace(/ {2,}/g, " ").replace(/^ +/, "").slice(0, NAME_MAX);
  }

  function nameError(value, prompt, label) {
    if (!value) return prompt;
    if (value.length < 2) return label + " must be at least 2 characters.";
    if (!NAME_PATTERN.test(value)) return label + " can only contain letters, no numbers or symbols.";
    return "";
  }

  // Indian mobile number as bare 10 digits (the +91 sits outside the box).
  var PHONE_PATTERN = /^[6-9]\d{9}$/;
  function phoneError(value) {
    if (!value) return "Enter the gym's phone number.";
    if (!PHONE_PATTERN.test(value)) return "Enter a valid 10-digit mobile number.";
    return "";
  }

  function emailError(value) {
    if (!value) return "Enter your email address.";
    if (value.length > EMAIL_MAX) return "Email must be " + EMAIL_MAX + " characters or fewer.";
    if (/\s/.test(value)) return "Email cannot contain spaces.";
    if (!EMAIL_PATTERN.test(value) || value.indexOf("..") !== -1) return "Enter a valid email address, like you@yourgym.in.";
    return "";
  }

  function showFormError(message) {
    var note = $("formError");
    note.textContent = message || "";
    note.hidden = !message;
  }

  function setBusy(busy, idle) {
    var button = $("submitBtn");
    var label = button.querySelector(".label");
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    label.textContent = busy ? "Please wait…" : idle;
  }

  function post(url, body) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
        return data;
      });
    });
  }

  function saveToken(token) {
    try { if (token) localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* cookie still carries the session */ }
  }

  // A field shows its error once it has been left or the form submitted. A red
  // message on the first typed character reads as nagging.
  function wireForm(fields, validate) {
    var touched = {};
    function paint() {
      var errors = validate();
      fields.forEach(function (field) {
        var message = touched[field] ? errors[field] || "" : "";
        $(field + "-error").textContent = message;
        var input = $(field);
        if (field === "terms") $("termsBox").classList.toggle("has-error", Boolean(message));
        else input.classList.toggle("has-error", Boolean(message));
        input.setAttribute("aria-invalid", message ? "true" : "false");
      });
      return errors;
    }
    fields.forEach(function (field) {
      var input = $(field);
      input.addEventListener("blur", function () { touched[field] = true; paint(); });
      input.addEventListener(field === "terms" ? "change" : "input", function () {
        if (field === "terms") touched[field] = true;
        if (field === "gymPhone") {
          var digits = input.value.replace(/\D+/g, "").slice(0, 10);
          if (digits !== input.value) input.value = digits;
        }
        if (field === "gymName" || field === "ownerName") {
          var cleaned = sanitizeName(input.value);
          if (cleaned !== input.value) {
            var caret = Math.max(0, input.selectionStart - (input.value.length - cleaned.length));
            input.value = cleaned;
            input.setSelectionRange(caret, caret);
          }
        }
        if (touched[field] || touched.confirm) paint();
      });
    });
    // `only` limits the check to some fields (one step of a multi-step form).
    return function submitCheck(only) {
      var checked = only || fields;
      checked.forEach(function (field) { touched[field] = true; });
      var errors = paint();
      var keys = checked.filter(function (field) { return errors[field]; });
      if (keys.length) {
        showFormError(keys.length === 1 ? "Fix the highlighted field to continue." : "Fix the " + keys.length + " highlighted fields to continue.");
        $(keys[0]).focus();
        return false;
      }
      showFormError("");
      return true;
    };
  }

  // Show/hide for password boxes.
  Array.prototype.forEach.call(document.querySelectorAll("[data-toggle]"), function (button) {
    button.addEventListener("click", function () {
      var input = $(button.getAttribute("data-toggle"));
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.querySelector("use").setAttribute("href", "/landing/icons.svg#" + (show ? "eye-off" : "eye"));
      input.focus({ preventScroll: true });
    });
  });

  // ---------------- Login ----------------
  var loginForm = $("loginForm");
  if (loginForm) {
    var checkLogin = wireForm(["email", "password"], function () {
      var errors = {};
      var email = $("email").value.trim();
      if (!email) errors.email = "Enter your email address.";
      if (!$("password").value) errors.password = "Enter your password.";
      return errors;
    });
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!checkLogin()) return;
      setBusy(true, "Log in");
      post("/api/auth/login", { email: $("email").value.trim(), password: $("password").value })
        .then(function (data) {
          saveToken(data.token);
          window.location.href = "/admin";
        })
        .catch(function (error) {
          showFormError(error.message);
          setBusy(false, "Log in");
        });
    });
  }

  // ---------------- Signup ----------------
  var signupForm = $("signupForm");
  if (signupForm) {
    var values = function () {
      return {
        gymName: $("gymName").value.trim(),
        ownerName: $("ownerName").value.trim(),
        gymPhone: $("gymPhone").value.trim(),
        email: $("email").value.trim(),
        password: $("password").value,
        confirm: $("confirm").value,
        terms: $("terms").checked,
        referralCode: $("referralCode").value.trim().toUpperCase(),
      };
    };

    // ?ref=CODE links from a partner prefill the box.
    try {
      var ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) $("referralCode").value = ref.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
    } catch (e) { /* no prefill */ }

    // Tell the owner straight away whether the code works; the server re-checks on submit.
    var codeValid = null;
    var codeTimer;
    var CODE_HINT = "Got a code from a Gymboo partner? Enter it to save ₹2,000 on the one-time licence.";
    function checkCode() {
      var code = $("referralCode").value.trim().toUpperCase();
      var hint = $("referralHint");
      codeValid = null;
      if (!code) { hint.textContent = CODE_HINT; return; }
      fetch("/api/public/referral/" + encodeURIComponent(code), { credentials: "same-origin" })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if ($("referralCode").value.trim().toUpperCase() !== code) return;
          codeValid = Boolean(data.valid);
          hint.textContent = codeValid
            ? "Code applied. You'll save ₹" + Number(data.discount).toLocaleString("en-IN") + " on the one-time licence."
            : "This code isn't valid. Check it, or leave it blank.";
        })
        .catch(function () { /* the server still validates on submit */ });
    }
    $("referralCode").addEventListener("input", function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      clearTimeout(codeTimer);
      codeTimer = setTimeout(checkCode, 350);
    });
    if ($("referralCode").value) checkCode();

    var checkSignup = wireForm(["gymName", "ownerName", "gymPhone", "email", "referralCode", "password", "confirm", "terms"], function () {
      var v = values();
      var errors = {
        gymName: nameError(v.gymName, "Enter your gym's name.", "Gym name"),
        ownerName: nameError(v.ownerName, "Enter your name.", "Name"),
        gymPhone: phoneError(v.gymPhone),
        email: emailError(v.email),
      };
      if (!v.password) errors.password = "Choose a password.";
      else if (v.password.length < 8) errors.password = "Password must be at least 8 characters.";
      else if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) errors.password = "Include at least one letter and one number.";
      if (!v.confirm) errors.confirm = "Re-type your password.";
      else if (v.confirm !== v.password) errors.confirm = "Both passwords must match.";
      if (!v.terms) errors.terms = "Please accept the terms to continue.";
      if (v.referralCode && codeValid === false) errors.referralCode = "This referral code isn't valid. Clear it to continue without one.";
      Object.keys(errors).forEach(function (k) { if (!errors[k]) delete errors[k]; });
      return errors;
    });

    // The gym card in the side panel: the name is "engraved" as it's typed,
    // with a light sweep across the card whenever it changes.
    var card = $("gymCard");
    function paintCard(field) {
      var v = values();
      var name = $("cardGymName");
      var owner = $("cardOwner");
      var phone = $("cardPhone");
      name.textContent = v.gymName || "Your Gym Name";
      name.classList.toggle("is-empty", !v.gymName);
      owner.textContent = v.ownerName || "Owner name";
      owner.classList.toggle("is-empty", !v.ownerName);
      var d = v.gymPhone;
      phone.textContent = d ? "+91 " + (d.length > 5 ? d.slice(0, 5) + " " + d.slice(5) : d) : "+91 ••••• •••••";
      phone.classList.toggle("is-empty", !d);
      if (field && card) {
        card.classList.remove("is-shining");
        void card.offsetWidth; // restart the sweep
        card.classList.add("is-shining");
      }
    }
    ["gymName", "ownerName", "gymPhone"].forEach(function (field) {
      $(field).addEventListener("input", function () { paintCard(field); });
    });
    paintCard();

    // A slight 3D tilt toward the pointer (mouse only; off with reduced motion).
    if (card && window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) {
      card.addEventListener("pointermove", function (e) {
        var box = card.getBoundingClientRect();
        var x = (e.clientX - box.left) / box.width - 0.5;
        var y = (e.clientY - box.top) / box.height - 0.5;
        card.style.setProperty("--ry", (x * 12).toFixed(2) + "deg");
        card.style.setProperty("--rx", (-y * 10).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--rx", "0deg");
      });
    }

    // Password strength drives the meter only; the pass/fail rule is above.
    $("password").addEventListener("input", function () {
      var p = $("password").value;
      var score = 0;
      if (p.length >= 8) score += 1;
      if (p.length >= 12) score += 1;
      if (/[a-zA-Z]/.test(p) && /\d/.test(p)) score += 1;
      if (/[^A-Za-z0-9]/.test(p)) score += 1;
      var fill = $("strengthFill");
      fill.style.width = (p ? score * 25 : 0) + "%";
      fill.className = "strength-fill" + (score >= 4 ? " good" : score >= 3 ? " ok" : "");
      $("strengthLabel").textContent = p ? ["Weak", "Weak", "Fair", "Good", "Strong"][score] : "Weak";
    });

    var dialog = $("termsDialog");
    $("termsLink").addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", "");
    });
    $("termsClose").addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });

    // Two steps, same as the phone app: the gym first, then the login.
    var STEP1 = ["gymName", "ownerName", "gymPhone"];
    var step = 1;
    function setStep(next) {
      step = next;
      $("step1").hidden = step !== 1;
      $("nextBtn").hidden = step !== 1;
      $("step2").hidden = step !== 2;
      $("step2Actions").hidden = step !== 2;
      $("stepLabel").textContent = "Step " + step + " of 2";
      $("stepTitle").textContent = step === 1 ? "Set up your gym" : "Create your login";
      var dots = document.querySelectorAll(".signup-steps span");
      dots[1].classList.toggle("on", step === 2);
      dots[0].classList.toggle("current", step === 1);
      dots[1].classList.toggle("current", step === 2);
      showFormError("");
      $(step === 1 ? "gymName" : "email").focus();
    }
    $("nextBtn").addEventListener("click", function () {
      if (checkSignup(STEP1)) setStep(2);
    });
    $("backBtn").addEventListener("click", function () { setStep(1); });

    signupForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (step === 1) { // Enter on the first step moves on
        if (checkSignup(STEP1)) setStep(2);
        return;
      }
      if (!checkSignup()) return;
      var v = values();
      setBusy(true, "Create my gym");
      post("/api/auth/signup", { gymName: v.gymName, ownerName: v.ownerName, gymPhone: v.gymPhone, email: v.email, password: v.password, referralCode: v.referralCode })
        .then(function (data) {
          saveToken(data.token);
          var gym = data.gym || {};
          $("successLede").textContent = "You're signed in as the owner of " + (gym.name || "your gym") + ". Open the dashboard to add your first member.";
          $("checkinLink").textContent = window.location.origin + "/checkin/" + (gym.slug || "");
          var tag = document.querySelector(".gym-card-tag");
          if (tag) tag.textContent = "Active";
          $("signupCard").hidden = true;
          $("successCard").hidden = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        })
        .catch(function (error) {
          showFormError(error.message);
          setBusy(false, "Create my gym");
        });
    });
  }
})();
