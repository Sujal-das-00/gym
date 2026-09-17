import { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { api, jsonRequest } from "../lib/api.js";
import { ACTIVE_GYM_KEY } from "../lib/constants.js";

export default function GymsDialog() {
  const { gymsDialogOpen, setGymsDialogOpen, gyms, loadGyms, selectGym, showToast } = useApp();
  const [form, setForm] = useState({ gymName: "", slug: "", adminEmail: "", adminPassword: "", adminName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const field = (key) => ({
    value: form[key],
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const close = () => {
    setGymsDialogOpen(false);
    setError("");
  };

  const onCreateGym = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await api(
        "/api/gyms",
        jsonRequest("POST", {
          gymName: form.gymName.trim(),
          slug: form.slug.trim(),
          adminEmail: form.adminEmail.trim(),
          adminPassword: form.adminPassword,
          adminName: form.adminName.trim(),
        }),
      );
      setForm({ gymName: "", slug: "", adminEmail: "", adminPassword: "", adminName: "" });
      await loadGyms();
      localStorage.setItem(ACTIVE_GYM_KEY, result.gym.id);
      showToast(`Gym "${result.gym.name}" created.`);
      setGymsDialogOpen(false);
      await selectGym(result.gym.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (gym) => {
    const next = gym.status === "suspended" ? "active" : "suspended";
    try {
      await api(`/api/gyms/${gym.id}/status`, jsonRequest("PATCH", { status: next }));
      await loadGyms();
    } catch (err) {
      showToast(err.message);
    }
  };

  return (
    <Dialog className="auth-dialog" id="gymsDialog" open={gymsDialogOpen} onClose={close}>
      <h3>Gyms</h3>
      <form className="auth-form" id="createGymForm" onSubmit={onCreateGym}>
        <div className="auth-grid">
          <label>
            Gym name
            <input id="newGymName" required {...field("gymName")} />
          </label>
          <label>
            Slug (optional)
            <input id="newGymSlug" placeholder="auto from name" {...field("slug")} />
          </label>
          <label>
            Admin email
            <input id="newGymAdminEmail" type="email" required {...field("adminEmail")} />
          </label>
          <label>
            Admin password
            <input id="newGymAdminPassword" type="password" required {...field("adminPassword")} />
          </label>
          <label>
            Admin name
            <input id="newGymAdminName" {...field("adminName")} />
          </label>
        </div>
        <div className="auth-error" id="gymFormError" hidden={!error}>
          {error}
        </div>
        <div className="auth-actions">
          <button type="submit" id="createGymSubmit" className={busy ? "is-busy" : ""} disabled={busy}>
            Create gym + admin
          </button>
          <button type="button" className="auth-chip" id="gymsClose" onClick={close}>
            Close
          </button>
        </div>
      </form>
      <div className="auth-list" id="gymsList">
        {gyms.length ? (
          gyms.map((gym) => (
            <div className="auth-list-row" key={gym.id}>
              <div>
                <strong>{gym.name}</strong>
                <small>{` /checkin/${gym.slug}${gym.status === "suspended" ? " · suspended" : ""}`}</small>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  className="auth-chip"
                  type="button"
                  onClick={async () => {
                    setGymsDialogOpen(false);
                    await selectGym(gym.id);
                  }}
                >
                  Manage
                </button>
                <button
                  className={"auth-chip" + (gym.status === "suspended" ? "" : " danger")}
                  type="button"
                  onClick={() => toggleStatus(gym)}
                >
                  {gym.status === "suspended" ? "Activate" : "Suspend"}
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="auth-list-empty">No gyms yet. Create one above.</p>
        )}
      </div>
    </Dialog>
  );
}
