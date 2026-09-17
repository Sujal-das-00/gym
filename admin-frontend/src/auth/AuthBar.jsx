import { useApp } from "../store/AppContext.jsx";
import { roleLabel } from "../lib/format.js";

export default function AuthBar() {
  const { user, gyms, gymId, selectGym, logout, setGymsDialogOpen, setStaffDialogOpen } = useApp();
  const role = user ? user.role : "";

  return (
    <div className="auth-bar" id="authBar" hidden={!user}>
      <select
        className="auth-select"
        id="gymSelect"
        hidden={role !== "super_admin"}
        aria-label="Active gym"
        value={gymId}
        onChange={(event) => selectGym(event.target.value)}
      >
        {gyms.map((gym) => (
          <option key={gym.id} value={gym.id}>
            {gym.name}
            {gym.status === "suspended" ? " (suspended)" : ""}
          </option>
        ))}
      </select>
      <button
        className="auth-chip"
        id="gymsBtn"
        type="button"
        hidden={role !== "super_admin"}
        onClick={() => setGymsDialogOpen(true)}
      >
        Gyms
      </button>
      <button
        className="auth-chip"
        id="staffBtn"
        type="button"
        hidden={!(role === "super_admin" || role === "gym_admin")}
        onClick={() => setStaffDialogOpen(true)}
      >
        Staff
      </button>
      <span className="auth-user" id="authUser">
        {user ? `${user.email} · ${roleLabel(role)}` : ""}
      </span>
      <button className="auth-chip danger" id="logoutBtn" type="button" onClick={logout}>
        Log out
      </button>
    </div>
  );
}
