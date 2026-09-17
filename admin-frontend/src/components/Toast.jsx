import { useApp } from "../store/AppContext.jsx";

export default function Toast() {
  const { toast } = useApp();
  return (
    <div className={"toast" + (toast ? " show" : "")} id="toast" role="status" aria-live="polite">
      {toast}
    </div>
  );
}
