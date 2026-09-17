import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { login, setToken } from "../lib/api.js";

export default function LoginOverlay() {
  const { user, authChecked, applyAuthedUser } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Stay hidden until the /api/auth/me probe settles, so a signed-in reload
  // never flashes the login card.
  const hidden = Boolean(user) || !authChecked;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const data = await login(email.trim(), password);
      setToken(data.token);
      setPassword("");
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
        <h2>Gym Admin</h2>
        <p className="auth-sub">Sign in to manage your gym.</p>
        <label>
          Email
          <input
            type="email"
            id="loginEmail"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            id="loginPassword"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div className="auth-error" id="loginError" hidden={!error}>
          {error}
        </div>
        <button type="submit" id="loginSubmit" className={busy ? "is-busy" : ""} disabled={busy}>
          Sign in
        </button>
      </form>
    </div>
  );
}
