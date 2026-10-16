// Gym owner signup. Posts to /api/auth/signup, which creates the gym and its
// owner account together and returns a session, so "Open my dashboard" lands on
// /admin already signed in.
//
// Every rule below is also enforced in backend/src/services/authService.js —
// these checks exist so the owner sees a precise, inline message instead of a
// round trip, never as the only line of defence.
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // Both names are letters and single spaces only — no digits, no punctuation —
  // the same rule the member and trainer forms use in the admin app.
  var NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
  var NAME_MAX = 30;
  // Local part, then a domain with at least one dot and a letters-only TLD. The
  // second test rejects the ".." and leading/trailing dots this one allows.
  var EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
  var EMAIL_MAX = 120;

  // Typed characters that can never be part of a name are dropped as they are
  // typed, so the field can't hold something the rules below would reject.
  function sanitizeName(value) {
    return String(value || "").replace(/[^A-Za-z ]+/g, "").replace(/ {2,}/g, " ").replace(/^ +/, "").slice(0, NAME_MAX);
  }

  // `prompt` is the "nothing typed yet" message; `label` names the field in the
  // rule messages that follow.
  function nameError(value, prompt, label) {
    if (!value) return prompt;
    if (value.length < 2) return label + " must be at least 2 characters.";
    if (value.length > NAME_MAX) return label + " must be " + NAME_MAX + " characters or fewer.";
    if (!NAME_PATTERN.test(value)) return label + " can only contain letters A-Z, no numbers or symbols.";
    return "";
  }

  function emailError(value) {
    if (!value) return "Enter your email address.";
    if (value.length > EMAIL_MAX) return "Email must be " + EMAIL_MAX + " characters or fewer.";
    if (/\s/.test(value)) return "Email cannot contain spaces.";
    if ((value.match(/@/g) || []).length !== 1) return "Email must contain exactly one @ sign.";
    if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address, like you@yourgym.in.";
    if (value.indexOf("..") !== -1) return "Email cannot contain two dots in a row.";
    var parts = value.split("@");
    if (parts[0].charAt(0) === "." || parts[0].slice(-1) === ".") return "Email cannot start or end the name with a dot.";
    if (parts[1].charAt(0) === "." || parts[1].charAt(0) === "-") return "Enter a valid domain after the @ sign.";
    return "";
  }

  var FIELDS = ["gymName", "ownerName", "email", "password", "confirm", "terms"];
  // A field shows its error once it has been left or the form submitted — a red
  // message on the first typed character reads as nagging.
  var touched = {};

  function values() {
    return {
      gymName: $("gymName").value.trim(),
      ownerName: $("ownerName").value.trim(),
      email: $("email").value.trim(),
      password: $("password").value,
      confirm: $("confirm").value,
      terms: $("terms").checked,
    };
  }

  function validate(v) {
    var errors = {};

    errors.gymName = nameError(v.gymName, "Enter your gym's name.", "Gym name");
    errors.ownerName = nameError(v.ownerName, "Enter your name.", "Name");
    errors.email = emailError(v.email);

    if (!v.password) errors.password = "Choose a password.";
    else if (v.password.length < 8) errors.password = "Password must be at least 8 characters.";
    else if (!/[a-zA-Z]/.test(v.password) || !/\d/.test(v.password)) {
      errors.password = "Include at least one letter and one number.";
    }

    if (!v.confirm) errors.confirm = "Re-type your password.";
    else if (v.confirm !== v.password) errors.confirm = "Both passwords must match.";

    if (!v.terms) errors.terms = "Please accept the terms to continue.";

    // Drop the fields that came back clean, so the caller can count the real
    // problems with Object.keys(errors).
    Object.keys(errors).forEach(function (field) {
      if (!errors[field]) delete errors[field];
    });
    return errors;
  }

  // Password strength drives the meter only; the pass/fail rule is in validate().
  function strengthOf(password) {
    var score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-zA-Z]/.test(password) && /\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(score, 4);
  }

  function paintStrength(password) {
    var score = password ? strengthOf(password) : 0;
    var fill = $("strengthFill");
    fill.style.width = (score * 25) + "%";
    fill.className = "strength-fill" + (score >= 4 ? " good" : score >= 3 ? " ok" : "");
    $("strengthLabel").textContent = !password ? "Weak" : ["Weak", "Weak", "Fair", "Good", "Strong"][score];
  }

  function paint() {
    var errors = validate(values());
    FIELDS.forEach(function (field) {
      var message = touched[field] ? errors[field] || "" : "";
      $(field + "-error").textContent = message;
      var input = $(field);
      if (field === "terms") $("termsBox").classList.toggle("has-error", Boolean(message));
      else input.classList.toggle("has-error", Boolean(message));
      input.setAttribute("aria-invalid", message ? "true" : "false");
    });
    return errors;
  }

  FIELDS.forEach(function (field) {
    var input = $(field);
    input.addEventListener("blur", function () { touched[field] = true; paint(); });
    input.addEventListener(field === "terms" ? "change" : "input", function () {
      if (field === "terms") touched[field] = true;
      if (field === "gymName" || field === "ownerName") {
        // Rewrite only when something was actually dropped, so the caret stays
        // put while a valid name is being typed.
        var cleaned = sanitizeName(input.value);
        if (cleaned !== input.value) {
          var caret = Math.max(0, input.selectionStart - (input.value.length - cleaned.length));
          input.value = cleaned;
          input.setSelectionRange(caret, caret);
        }
      }
      // Re-check a field the owner has already left, so a fix clears its error
      // as soon as it is typed.
      if (touched[field] || touched.confirm) paint();
      if (field === "password") paintStrength($("password").value);
    });
  });

  // Show/hide for both password boxes.
  Array.prototype.forEach.call(document.querySelectorAll("[data-toggle]"), function (button) {
    button.addEventListener("click", function () {
      var input = $(button.getAttribute("data-toggle"));
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
      button.querySelector(".material-symbols-outlined").textContent = show ? "visibility_off" : "visibility";
      input.focus({ preventScroll: true });
    });
  });

  $("termsLink").addEventListener("click", function (e) {
    e.preventDefault();
    alert(
      "Terms of Service\n\n" +
      "This is a student project. Your gym's data is stored on this server and is " +
      "visible to you, your staff logins and the platform owner. Do not store " +
      "anything you would not want on a shared server."
    );
  });

  function showFormError(message) {
    var note = $("formError");
    note.textContent = message || "";
    note.hidden = !message;
    if (message) note.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setBusy(busy) {
    var button = $("submitBtn");
    button.disabled = busy;
    button.lastChild.textContent = busy ? " Creating your gym..." : " Create my gym";
  }

  $("signupForm").addEventListener("submit", function (e) {
    e.preventDefault();
    FIELDS.forEach(function (field) { touched[field] = true; });
    var errors = paint();
    var first = FIELDS.filter(function (field) { return errors[field]; })[0];
    if (first) {
      showFormError(
        Object.keys(errors).length === 1
          ? "Fix the highlighted field to continue."
          : "Fix the " + Object.keys(errors).length + " highlighted fields to continue."
      );
      $(first).focus();
      return;
    }

    showFormError("");
    setBusy(true);
    var v = values();

    fetch("/api/auth/signup", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gymName: v.gymName,
        ownerName: v.ownerName,
        email: v.email,
        password: v.password,
      }),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || "Could not create your gym. Try again.");
        return data;
      });
    }).then(function (data) {
      // The session cookie is set by the server, but some setups don't deliver it
      // back (host mismatch, SameSite). The dashboard also accepts this token as
      // a Bearer header, so store it under the key admin-frontend reads.
      try {
        if (data.token) localStorage.setItem("gym-admin-token", data.token);
      } catch (error) {
        // Private mode — the cookie still carries the session.
      }
      showSuccess(data);
    }).catch(function (error) {
      showFormError(error.message);
    }).finally(function () {
      setBusy(false);
    });
  });

  function showSuccess(data) {
    var slug = data && data.gym ? data.gym.slug : "";
    var name = data && data.gym ? data.gym.name : "your gym";
    $("successLede").textContent =
      "You're signed in as the owner of " + name + ". Open the dashboard to add your first member.";
    $("checkinLink").textContent = window.location.origin + "/checkin/" + slug;
    $("signupCard").hidden = true;
    $("successCard").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  paintStrength("");
})();
