// Inline message under a field. Renders nothing when the field is valid so the
// grid rows do not jump as the admin types.
export default function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <small className="field-error" id={id} role="alert">
      {message}
    </small>
  );
}
