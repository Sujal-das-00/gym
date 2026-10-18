import { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";

// The banner, the topbar badge and the mobile app-bar chip all read the plan
// status. One request per signed-in user serves all of them.
let cached = null; // { user, promise }

export default function useLicence() {
  const { user } = useApp();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (!cached || cached.user !== user) cached = { user, promise: api("/api/licence") };
    let alive = true;
    cached.promise
      .then((data) => alive && setStatus(data))
      .catch(() => {}); // plan status is a nicety; never block the dashboard on it
    return () => {
      alive = false;
    };
  }, [user]);

  return status;
}
