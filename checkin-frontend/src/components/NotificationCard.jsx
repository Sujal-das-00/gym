import Icon from "./Icon.jsx";

/**
 * The member's notification switch. Rendered on the home screen rather than
 * behind a settings page, because the permission prompt has to come from a tap
 * the member made on purpose — and because a member who never sees this never
 * gets a fee reminder.
 */
export default function NotificationCard({ push }) {
  if (!push.available) return null;

  const blocked = push.permission === "denied";

  return (
    <section className="rounded-2xl bg-surface-container-lowest border border-outline-variant/40 p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="shrink-0 w-10 h-10 rounded-full bg-primary-tint text-primary flex items-center justify-center">
          <Icon className="text-[20px]" name={push.enabled ? "notifications_active" : "notifications"} />
        </span>
        <div className="flex flex-col min-w-0">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Fee reminders</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            {push.enabled
              ? "This device will get a reminder when your dues are pending."
              : "Get a reminder on this device when your dues are pending."}
          </p>
        </div>
      </div>

      {/* A blocked permission can only be undone in browser settings — the browser
          will not show the prompt again, so telling them to "tap again" alone is
          a dead end. The hook re-reads the permission when they come back to
          this tab, so the card un-greys itself with no reload. */}
      {blocked ? (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex flex-col gap-1.5">
          <p className="font-body-sm text-body-sm text-red-700 font-semibold">
            Notifications are blocked for this site.
          </p>
          <p className="font-body-sm text-body-sm text-red-700">
            <strong>Android / Chrome:</strong> tap the lock icon next to the web address → Permissions →
            Notifications → Allow.
          </p>
          <p className="font-body-sm text-body-sm text-red-700">
            <strong>iPhone:</strong> Settings → Notifications → GymBoo → Allow Notifications.
          </p>
          <p className="font-body-sm text-body-sm text-red-700/80">
            Come back to this screen afterwards — the button turns on by itself.
          </p>
        </div>
      ) : null}
      {push.error && !blocked ? (
        <p className="font-body-sm text-body-sm text-red-600">{push.error}</p>
      ) : null}

      <button
        className={
          "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all active:scale-[0.99] disabled:opacity-60 " +
          (push.enabled
            ? "bg-white border border-outline-variant text-on-surface-variant"
            : "bg-primary text-white shadow-sm")
        }
        disabled={push.busy || blocked}
        onClick={push.enabled ? push.disable : push.enable}
        type="button"
      >
        <Icon className="text-[17px]" name={push.enabled ? "notifications_off" : "notifications_active"} />
        {push.busy ? "Working…" : push.enabled ? "Turn off on this device" : "Turn on notifications"}
      </button>
    </section>
  );
}
