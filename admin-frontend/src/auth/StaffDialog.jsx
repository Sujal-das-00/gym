import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { api, jsonRequest } from "../lib/api.js";
import { roleLabel } from "../lib/format.js";

export default function StaffDialog() {
  const { staffDialogOpen, setStaffDialogOpen, showToast } = useApp();
  const [staff, setStaff] = useState([]);
  const [listError, setListError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "staff" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const field = (key) => ({
    value: form[key],
    onChange: (event) => setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  const loadStaff = async () => {
    try {
      setStaff(await api("/api/staff"));
      setListError("");
    } catch (err) {
      setStaff([]);
      setListError(err.message);
    }
  };

  useEffect(() => {
    if (!staffDialogOpen) return;
    setError("");
    loadStaff();
  }, [staffDialogOpen]);

  const close = () => {
    setStaffDialogOpen(false);
    setError("");
  };

  const onCreateStaff = async (event) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await api(
        "/api/staff",
        jsonRequest("POST", {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        }),
      );
      setForm({ name: "", email: "", password: "", role: "staff" });
      await loadStaff();
      showToast("Staff account created.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog className="auth-dialog" id="staffDialog" open={staffDialogOpen} onClose={close}>
      <h3>Staff accounts</h3>
      <form className="auth-form" id="createStaffForm" onSubmit={onCreateStaff}>
        <div className="auth-grid">
          <label>
            Name
            <input id="newStaffName" {...field("name")} />
          </label>
          <label>
            Email
            <input id="newStaffEmail" type="email" required {...field("email")} />
          </label>
          <label>
            Password
            <input id="newStaffPassword" type="password" required {...field("password")} />
          </label>
          <label>
            Role
            <select id="newStaffRole" {...field("role")}>
              <option value="staff">Staff</option>
              <option value="gym_admin">Gym admin</option>
            </select>
          </label>
        </div>
        <div className="auth-error" id="staffFormError" hidden={!error}>
          {error}
        </div>
        <div className="auth-actions">
          <button type="submit" className={busy ? "is-busy" : ""} disabled={busy}>
            Add staff
          </button>
          <button type="button" className="auth-chip" id="staffClose" onClick={close}>
            Close
          </button>
        </div>
      </form>
      <div className="auth-list" id="staffList">
        {listError ? (
          <p className="auth-list-empty">{listError}</p>
        ) : staff.length ? (
          staff.map((member) => (
            <div className="auth-list-row" key={member.id || member.email}>
              <div>
                <strong>{member.name || member.email}</strong>
                <small>{` ${member.email} · ${roleLabel(member.role)}`}</small>
              </div>
            </div>
          ))
        ) : (
          <p className="auth-list-empty">No staff yet.</p>
        )}
      </div>
    </Dialog>
  );
}
