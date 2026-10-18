import { createContext, useContext } from "react";

export const AppContext = createContext(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside <AppProvider>");
  return value;
}

// The toast text and the drawer flag change several times per tap (a toast
// shows, then hides 2s later). They live apart from AppContext so that only the
// toast, the app bar and the scrim re-render for them, not every screen.
export const ShellContext = createContext({ toast: "", drawerOpen: false });

export function useShell() {
  return useContext(ShellContext);
}
