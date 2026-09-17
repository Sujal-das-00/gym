import { useEffect, useRef } from "react";

/**
 * Wraps the native <dialog> the original markup used, so the backdrop, Esc
 * handling and focus trapping stay exactly as the browser provides them.
 */
export default function Dialog({ open, onClose, className, id, children, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    // Esc (and any native close) has to flow back into React state.
    const handleClose = () => onClose?.();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog className={className} id={id} ref={ref} {...rest}>
      {open ? children : null}
    </dialog>
  );
}
