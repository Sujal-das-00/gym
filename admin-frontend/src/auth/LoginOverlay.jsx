import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { login, setToken, signup } from "../lib/api.js";

const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

function PasswordInput({ id, value, onChange, autoComplete, placeholder }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="password-field">
      <input
        type={shown ? "text" : "password"}
        id={id}
        autoComplete={autoComplete}
        placeholder={placeholder}
        maxLength={72}
        required
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="password-toggle"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {shown ? (
            <>
              <path d="M17.94 17.94A10.9 10.9 0 0 1 12 20c-7 0-11-8-11-8a19.8 19.8 0 0 1 5.06-5.94M9.9 4.24A10.9 10.9 0 0 1 12 4c7 0 11 8 11 8a19.8 19.8 0 0 1-3.17 4.19M1 1l22 22" />
              <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </span>
  );
}

export default function LoginOverlay() {
  const { user, authChecked, applyAuthedUser } = useApp();
  const [mode, setMode] = useState("login");
  const [gymName, setGymName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  // Stay hidden until the /api/auth/me probe settles, so a signed-in reload
  // never flashes the login card.
  const hidden = Boolean(user) || !authChecked;

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setPassword("");
    setConfirm("");
  };

  // Mirrors the server's signup rules for instant feedback; the server re-checks.
  const validateSignup = () => {
    const gym = gymName.trim();
    const owner = ownerName.trim();
    if (!NAME_PATTERN.test(gym) || gym.length < 2 || gym.length > 30) {
      return "Gym name must be 2-30 letters, with no numbers or symbols.";
    }
    if (!NAME_PATTERN.test(owner) || owner.length < 2 || owner.length > 30) {
      return "Your name must be 2-30 letters, with no numbers or symbols.";
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      return "Password must be at least 8 characters with a letter and a number.";
    }
    if (password !== confirm) return "Both passwords must match.";
    return "";
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (isSignup) {
      const problem = validateSignup();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    try {
      const data = isSignup
        ? await signup({
            gymName: gymName.trim(),
            ownerName: ownerName.trim(),
            email: email.trim(),
            password,
            referralCode: referralCode.trim(),
          })
        : await login(email.trim(), password);
      setToken(data.token);
      setPassword("");
      setConfirm("");
      await applyAuthedUser(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay" id="loginOverlay" hidden={hidden}>
      <form className="auth-card" id="loginForm" onSubmit={onSubmit}>
        <h2>{isSignup ? "Create your gym account" : "Gym Admin"}</h2>
        <p className="auth-sub">
          {isSignup ? "Register your gym and become its owner." : "Sign in to manage your gym."}
        </p>
        {isSignup && (
          <>
            <label>
              Gym name
              <input
                type="text"
                id="signupGymName"
                autoComplete="organization"
                maxLength={30}
                required
                value={gymName}
                onChange={(event) => setGymName(event.target.value)}
              />
            </label>
            <label>
              Your name
              <input
                type="text"
                id="signupOwnerName"
                autoComplete="name"
                maxLength={30}
                required
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Email
          <input
            type="email"
            id="loginEmail"
            autoComplete={isSignup ? "email" : "username"}
            maxLength={120}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <PasswordInput
            id="loginPassword"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {isSignup && (
          <>
            <label>
              Confirm password
              <PasswordInput
                id="signupConfirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
            <label>
              Referral code (optional)
              <input
                type="text"
                id="signupReferral"
                autoComplete="off"
                maxLength={20}
                value={referralCode}
                onChange={(event) =>
                  setReferralCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
              />
            </label>
          </>
        )}
        <div className="auth-error" id="loginError" hidden={!error}>
          {error}
        </div>
        <button type="submit" id="loginSubmit" className={busy ? "is-busy" : ""} disabled={busy}>
          {isSignup ? "Create account" : "Sign in"}
        </button>
        <p className="auth-switch">
          {isSignup ? "Already have an account?" : "New here?"}{" "}
          <button type="button" className="auth-link" onClick={() => switchMode(isSignup ? "login" : "signup")}>
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </form>
    </div>
  );
}
