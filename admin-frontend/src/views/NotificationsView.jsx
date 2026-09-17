import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency } from "../lib/dates.js";
import { fetchPendingFeeSummary, sendCustomNotification, sendFeeReminders } from "../lib/notifications.js";

const MAX_TITLE = 80;
const MAX_MESSAGE = 300;

const AUDIENCES = [
  { value: "all", label: "All members" },
  { value: "pending-fees", label: "Members with pending fees" },
  { value: "selected", label: "Selected members" },
];

// Only the gym owner may message the whole membership. `staff` can collect fees
// and mark attendance but never triggers a mass send. The backend enforces the
// same rule — this only keeps the screen out of reach of an account that can't
// use it.
const OWNER_ROLES = ["gym_admin", "super_admin"];

// What actually happened, in the order an owner wants to read it.
function SendSummary({ result }) {
  if (!result) return null;
  const rows = [
    ["Eligible members", result.eligibleMembers],
    ["Notifications attempted", result.attempted],
    ["Delivered", result.sent],
    ["Failed", result.failed],
    ["Expired devices removed", result.expired],
    ["No notifications turned on", result.membersWithoutSubscription],
  ];
  return (
    <div className="notify-summary">
      <h3 className="subhead">{result.kind} sent</h3>
      <div className="notify-summary-grid">
        {rows.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{Number(value || 0)}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}

/**
 * "Send Notification" — the one screen where a gym owner controls push.
 *
 * Two independent actions: a one-click reminder to everyone who owes money
 * (personalized per member on the backend), and a free-text announcement with a
 * chosen audience. Neither ever leaves this gym: the recipient list is rebuilt
 * server-side from the authenticated gym's members.
 */
export default function NotificationsView() {
  const { members, domain, user, showToast } = useApp();

  const [preview, setPreview] = useState(null);
  const [remindBusy, setRemindBusy] = useState(false);
  const [result, setResult] = useState(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [sendBusy, setSendBusy] = useState(false);

  const isOwner = OWNER_ROLES.includes(user?.role);

  // How many members owe money and how many of them can actually be reached, so
  // the button can say what it will do before it does it.
  const refreshPreview = useCallback(() => {
    if (!isOwner) return;
    fetchPendingFeeSummary()
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [isOwner]);

  useEffect(refreshPreview, [refreshPreview]);

  const pendingCount = useMemo(
    () => members.filter((member) => domain.getOverdueAmount(member) > 0).length,
    [members, domain],
  );

  if (!isOwner) {
    return (
      <section className="panel">
        <p className="history-empty">Only the gym owner can send notifications to members.</p>
      </section>
    );
  }

  const unavailable = preview?.available === false;
  const reachable = preview?.reachableMembers ?? 0;

  const query = search.trim().toLowerCase();
  const matches = members
    .filter((member) => !query || `${member.name} ${member.phone}`.toLowerCase().includes(query))
    .slice(0, 80);
  const selected = new Set(selectedIds);
  const recipientCount =
    audience === "all" ? members.length : audience === "pending-fees" ? pendingCount : selectedIds.length;

  const toggleMember = (id, checked) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds([...next]);
  };

  const onRemind = async () => {
    if (remindBusy) return;
    if (!reachable) {
      showToast("No member with pending fees has turned notifications on yet.");
      return;
    }
    // Notifications can't be recalled once the push services have them, so the
    // count is confirmed before anything is sent.
    const ok = confirm(`Send a fee reminder to ${reachable} member${reachable === 1 ? "" : "s"} with pending dues?`);
    if (!ok) return;
    setRemindBusy(true);
    try {
      const summary = await sendFeeReminders();
      setResult({ kind: "Fee reminders", ...summary });
      showToast(`Fee reminders sent to ${summary.notifiedMembers} member(s).`);
      refreshPreview();
    } catch (error) {
      showToast(error.message);
    } finally {
      setRemindBusy(false);
    }
  };

  const onSubmitCustom = async (event) => {
    event.preventDefault();
    if (sendBusy) return;
    if (audience === "selected" && !selectedIds.length) {
      showToast("Pick at least one member first.");
      return;
    }
    const ok = confirm(`Send "${title.trim()}" to ${recipientCount} member${recipientCount === 1 ? "" : "s"}?`);
    if (!ok) return;
    setSendBusy(true);
    try {
      const summary = await sendCustomNotification({
        title: title.trim(),
        message: message.trim(),
        audience,
        memberIds: audience === "selected" ? selectedIds : undefined,
      });
      setResult({ kind: "Custom notification", ...summary });
      showToast(`Notification sent to ${summary.sent} device(s).`);
      setTitle("");
      setMessage("");
      setSelectedIds([]);
      setSearch("");
    } catch (error) {
      showToast(error.message);
    } finally {
      setSendBusy(false);
    }
  };

  if (unavailable) {
    // "invalid" is the common trap: VAPID keys are an ECDSA P-256 pair, not a
    // random secret like JWT_SECRET, so a hand-typed string sets the variables
    // without enabling anything.
    const invalidKeys = preview?.disabledReason === "invalid";
    return (
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Push notifications are switched off</h2>
            {invalidKeys ? (
              <p>
                <code>VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> are set, but they are not a
                valid key pair. They cannot be a random string — they must be a matched pair generated with{" "}
                <code>node -e "console.log(require('web-push').generateVAPIDKeys())"</code>. Replace both
                values and restart the server.
              </p>
            ) : (
              <p>
                This server has no VAPID keys. Generate a pair with{" "}
                <code>node -e "console.log(require('web-push').generateVAPIDKeys())"</code>, set{" "}
                <code>VAPID_PUBLIC_KEY</code> and <code>VAPID_PRIVATE_KEY</code> in the environment, and
                restart.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="notify-view">
      <section className="panel notify-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Fee reminders</p>
            <h2>🔔 Remind Members with Pending Fees</h2>
            <p>
              Every member who owes money gets their own reminder with their name and the exact amount.
              Members who have not turned notifications on are skipped.
            </p>
          </div>
        </div>

        <div className="notify-stats">
          <article>
            <span>Members with pending fees</span>
            <strong>{preview ? preview.eligibleMembers : "—"}</strong>
          </article>
          <article>
            <span>Reachable by notification</span>
            <strong>{preview ? preview.reachableMembers : "—"}</strong>
          </article>
          <article>
            <span>Total outstanding</span>
            <strong>{preview ? currency(preview.totalOutstanding) : "—"}</strong>
          </article>
        </div>

        <button
          className="notify-button"
          disabled={remindBusy || !preview}
          onClick={onRemind}
          type="button"
        >
          {remindBusy ? "Sending…" : "🔔 Remind Members with Pending Fees"}
        </button>
      </section>

      <section className="panel notify-panel">
        <form className="notify-form" onSubmit={onSubmitCustom}>
          <div className="panel-head">
            <div>
              <p className="eyebrow">Announcement</p>
              <h2>✉ Send Custom Notification</h2>
              <p>Write your own message and choose who receives it.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Title
              <input
                maxLength={MAX_TITLE}
                name="title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Holiday notice"
                required
                type="text"
                value={title}
              />
            </label>
            <label>
              Recipients
              <select name="audience" onChange={(event) => setAudience(event.target.value)} value={audience}>
                {AUDIENCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide">
              Message
              <textarea
                maxLength={MAX_MESSAGE}
                name="message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder="The gym stays closed this Sunday for maintenance."
                required
                rows={3}
                value={message}
              />
              <span className="field-hint">
                {message.length}/{MAX_MESSAGE} characters
              </span>
            </label>
          </div>

          {audience === "selected" ? (
            <div className="notify-picker">
              <input
                className="notify-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or mobile number..."
                type="search"
                value={search}
              />
              <div className="fee-month-list">
                {matches.length ? (
                  matches.map((member) => (
                    <label className="fee-month-option" key={member.id}>
                      <input
                        checked={selected.has(member.id)}
                        onChange={(event) => toggleMember(member.id, event.target.checked)}
                        type="checkbox"
                        value={member.id}
                      />
                      <span>{member.name}</span>
                      <strong>{member.phone}</strong>
                    </label>
                  ))
                ) : (
                  <p className="history-empty">No members match that search.</p>
                )}
              </div>
            </div>
          ) : null}

          <p className="field-hint notify-recipient-count">
            {recipientCount} member{recipientCount === 1 ? "" : "s"} selected. Members who have not turned on
            notifications are skipped.
          </p>

          <button
            className="notify-button"
            disabled={sendBusy || !title.trim() || !message.trim()}
            type="submit"
          >
            {sendBusy ? "Sending…" : "✉ Send notification"}
          </button>
        </form>
      </section>

      {result ? (
        <section className="panel notify-panel">
          <SendSummary result={result} />
        </section>
      ) : null}
    </div>
  );
}
