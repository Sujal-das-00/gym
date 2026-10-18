import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { currency } from "../lib/dates.js";
import { getInitials } from "../lib/format.js";
import { fetchPendingFeeSummary, sendCustomNotification, sendFeeReminders } from "../lib/notifications.js";
import Icon from "../components/Icon.jsx";
import Photo from "../components/Photo.jsx";

const MAX_TITLE = 80;
const MAX_MESSAGE = 300;

const AUDIENCES = [
  { value: "all", label: "All" },
  { value: "pending-fees", label: "Owe fees" },
  { value: "selected", label: "Select" },
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
    ["Attempted", result.attempted],
    ["Delivered", result.sent],
    ["Failed", result.failed],
    ["Expired devices removed", result.expired],
    ["Notifications off", result.membersWithoutSubscription],
  ];
  return (
    <section className="dash-card notify-result" aria-live="polite">
      <header className="dash-card-head">
        <div>
          <h3>{result.kind} sent</h3>
          <p>What happened with the last send</p>
        </div>
        <Icon name="check_circle" className="notify-result-icon" />
      </header>
      <dl className="member-stats">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{Number(value || 0)}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  const { members, domain, user, settings, showToast } = useApp();
  const [tab, setTab] = useState("reminder");

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

  // isOverdue, not getOverdueAmount > 0 — the same test the Dashboard, Members
  // and Payments screens use, and the one membersWithPendingFees() applies on the
  // backend. An amount test silently drops members whose fee is 0.
  const pendingCount = useMemo(
    () => members.filter((member) => domain.isOverdue(member)).length,
    [members, domain],
  );

  if (!isOwner) {
    return <p className="contact-empty">Only the gym owner can send notifications to members.</p>;
  }

  const unavailable = preview?.available === false;
  const reachable = preview?.reachableMembers ?? 0;
  // Members who owe money AND have no device registered — the ones to chase in
  // person, and the reason a send can come back as zero.
  const unreachable = (preview?.pending || []).filter((entry) => entry.devices === 0);
  // Everyone in the gym who has the member app's switch on, overdue or not.
  // This is what an announcement to "All members" actually reaches, and the
  // only way to see why that can land on a phone while a fee reminder finds
  // nobody: the registered devices belong to members who are paid up.
  const subscribed = preview?.subscribed || [];

  const query = search.trim().toLowerCase();
  const matches = members
    .filter((member) => !query || `${member.name} ${member.phone}`.toLowerCase().includes(query))
    .slice(0, 80);
  const selected = new Set(selectedIds);
  const recipientCount =
    audience === "all" ? members.length : audience === "pending-fees" ? pendingCount : selectedIds.length;

  const toggleMember = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds([...next]);
  };
  const memberById = (id) => members.find((member) => member.id === id);
  const gymName = settings?.gymName || "Your gym";

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
      <section className="dash-card notify-off">
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

  const contactRow = (entry, state) => {
    const member = memberById(entry.id);
    return (
      <li key={entry.id}>
        <div className="contact-row is-static no-dot">
          <span className="contact-avatar">
            {member ? <Photo person={member} /> : <span className="avatar-fallback">{getInitials(entry.name)}</span>}
          </span>
          <span className="contact-copy">
            <strong>
              <span className="contact-name">{entry.name}</span>
            </strong>
            <small>{entry.phone}</small>
          </span>
          <span className="contact-state">{state}</span>
        </div>
      </li>
    );
  };

  return (
    <section className="list-view notify-view" aria-label="Send notification">
      <div className="segmented" role="radiogroup" aria-label="Notification type">
        <label>
          <input type="radio" name="notifyTab" checked={tab === "reminder"} onChange={() => setTab("reminder")} />
          <span>Fee reminder</span>
        </label>
        <label>
          <input type="radio" name="notifyTab" checked={tab === "announce"} onChange={() => setTab("announce")} />
          <span>Announcement</span>
        </label>
      </div>

      {tab === "reminder" ? (
        <>
          <div className="summary-pair">
            <div>
              <span>Owe fees</span>
              <strong>{preview ? preview.eligibleMembers : "—"}</strong>
              <small>{preview ? `${currency(preview.totalOutstanding)} outstanding` : "Loading…"}</small>
            </div>
            <div>
              <span>Reachable</span>
              <strong>{preview ? preview.reachableMembers : "—"}</strong>
              <small>have notifications on</small>
            </div>
          </div>

          <p className="list-note is-info">
            <Icon name="notifications_active" />
            <span>
              Each member who owes gets their own reminder with their name and exact amount.
              {preview ? ` Notifications are on for ${preview.subscribedMembers} of ${preview.totalMembers} members.` : ""}
            </span>
          </p>

          {/* The confusing case: people owe money, but the reminder reaches nobody
              because none of THEM have notifications on. Stated inline, with the
              members named below, rather than in a toast that vanishes. */}
          {preview && preview.eligibleMembers > 0 && preview.reachableMembers === 0 ? (
            <p className="list-note">
              <Icon name="warning" />
              <span>
                <strong>No reminders can be sent yet.</strong> None of the {preview.eligibleMembers} member
                {preview.eligibleMembers === 1 ? "" : "s"} who owe have turned on notifications.
                {preview.subscribedMembers > 0
                  ? " The members with notifications on are paid up, which is why an announcement still reaches a phone."
                  : ""}{" "}
                Ask them to sign in on the check-in page and tap &quot;Turn on notifications&quot;.
              </span>
            </p>
          ) : null}

          {unreachable.length ? (
            <section className="contact-group" aria-label="Owe fees but cannot be reached">
              <h3 className="contact-group-title">
                Owe fees · notifications off
                <span>
                  {unreachable.length}
                  {preview.eligibleMembers > preview.pending.length ? "+" : ""}
                </span>
              </h3>
              <ul className="contact-list">
                {unreachable.map((entry) =>
                  contactRow(entry, <strong className="notify-owed">{currency(entry.outstanding)}</strong>),
                )}
              </ul>
            </section>
          ) : null}

          {subscribed.length ? (
            <section className="contact-group" aria-label="Notifications turned on">
              <h3 className="contact-group-title">
                Notifications on
                <span>
                  {subscribed.length}
                  {preview.subscribedMembers > subscribed.length ? "+" : ""}
                </span>
              </h3>
              <ul className="contact-list">
                {subscribed.map((entry) =>
                  contactRow(
                    entry,
                    <>
                      <span className={"status-pill " + (entry.overdue ? "overdue" : "paid")}>
                        {entry.overdue ? "Owes" : "Paid up"}
                      </span>
                      <small>
                        {entry.devices} device{entry.devices === 1 ? "" : "s"}
                      </small>
                    </>,
                  ),
                )}
              </ul>
            </section>
          ) : null}

          <button className="sheet-confirm notify-send" disabled={remindBusy || !preview || !reachable} onClick={onRemind} type="button">
            <Icon name="notifications_active" />
            {remindBusy
              ? "Sending…"
              : reachable
                ? `Remind ${reachable} member${reachable === 1 ? "" : "s"}`
                : "No one to remind yet"}
          </button>
        </>
      ) : (
        <form className="notify-form" onSubmit={onSubmitCustom}>
          <section className="dash-card">
            <div className="mf-grid">
              <label className="mf-field wide">
                <span className="mf-label-row">
                  Title
                  <em>
                    {title.length}/{MAX_TITLE}
                  </em>
                </span>
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
              <label className="mf-field wide">
                <span className="mf-label-row">
                  Message
                  <em>
                    {message.length}/{MAX_MESSAGE}
                  </em>
                </span>
                <textarea
                  maxLength={MAX_MESSAGE}
                  name="message"
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="The gym stays closed this Sunday for maintenance."
                  required
                  rows={3}
                  value={message}
                />
              </label>
              <div className="mf-field wide">
                <span className="mf-label" id="notifyAudienceLabel">
                  Send to
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="notifyAudienceLabel">
                  {AUDIENCES.map((option) => (
                    <label key={option.value}>
                      <input
                        type="radio"
                        name="audience"
                        value={option.value}
                        checked={audience === option.value}
                        onChange={() => setAudience(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {audience === "selected" ? (
            <section className="contact-group notify-picker" aria-label="Select members">
              <div className="list-toolbar">
                <label className="list-search">
                  <Icon name="search" />
                  <input
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or mobile"
                    aria-label="Search members"
                    type="search"
                    value={search}
                  />
                </label>
              </div>
              {matches.length ? (
                <ul className="contact-list">
                  {matches.map((member) => {
                    const checked = selected.has(member.id);
                    return (
                      <li key={member.id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          className={"contact-row no-dot notify-pick" + (checked ? " is-checked" : "")}
                          onClick={() => toggleMember(member.id)}
                        >
                          <span className="contact-avatar">
                            <Photo person={member} />
                          </span>
                          <span className="contact-copy">
                            <strong>
                              <span className="contact-name">{member.name}</span>
                            </strong>
                            <small>{member.phone}</small>
                          </span>
                          <span className="pay-check" aria-hidden="true">
                            <Icon name="check" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="contact-empty">No members match that search.</p>
              )}
            </section>
          ) : null}

          <section className="notify-preview" aria-label="Preview">
            <span className="mf-label">Preview</span>
            <div className="notify-bubble">
              <span className="notify-bubble-icon" aria-hidden="true">
                {getInitials(gymName) || "G"}
              </span>
              <div>
                <small>{gymName} · now</small>
                <strong>{title.trim() || "Your title"}</strong>
                <p>{message.trim() || "Your message appears here."}</p>
              </div>
            </div>
          </section>

          <button className="sheet-confirm notify-send" disabled={sendBusy || !title.trim() || !message.trim()} type="submit">
            <Icon name="send" />
            {sendBusy ? "Sending…" : `Send to ${recipientCount} member${recipientCount === 1 ? "" : "s"}`}
          </button>
          <p className="notify-foot">Members who have not turned on notifications are skipped.</p>
        </form>
      )}

      <SendSummary result={result} />
    </section>
  );
}
