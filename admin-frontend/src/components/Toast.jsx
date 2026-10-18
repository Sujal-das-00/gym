import { useShell } from "../store/AppContext.jsx";

export default function Toast() {
  const { toast } = useShell();
  return (
    <div className={"toast" + (toast ? " show" : "")} id="toast" role="status" aria-live="polite">
      {toast}
    </div>
  );
}
