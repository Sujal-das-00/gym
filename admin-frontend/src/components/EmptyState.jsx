/** The `.empty-state` block — shown via the `show` class, exactly as before. */
export default function EmptyState({ id, show, avatar, title, copy, action, className = "" }) {
  return (
    <div className={["empty-state", className, show ? "show" : ""].filter(Boolean).join(" ")} id={id}>
      <div className="empty-avatar">{avatar}</div>
      <h3>{title}</h3>
      <p>{copy}</p>
      {action}
    </div>
  );
}
