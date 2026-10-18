import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";
import { CHECKIN_STATUS_COPY } from "../lib/constants.js";
import { displayDate, timeText, todayKey } from "../lib/dates.js";
import { getInitials } from "../lib/format.js";
import Dialog from "../components/Dialog.jsx";
import Icon from "../components/Icon.jsx";
import Photo from "../components/Photo.jsx";

export default function CheckinView() {
  const { activeView, findLocalMemberByQr, refreshAttendanceStatus, showToast } = useApp();
  const [status, setStatus] = useState("checking");
  const [checkinUrl, setCheckinUrl] = useState("");
  const [today, setToday] = useState({ code: "", date: "", qrUrl: "" });
  const [rows, setRows] = useState([]);
  // Full-screen QR for a tablet or monitor at the front desk.
  const [presenting, setPresenting] = useState(false);
  const configLoaded = useRef(false);
  // Rows already seen keep their place; only genuinely new ones get the `is-new`
  // highlight, as in the original feed.
  const knownCheckinIds = useRef(new Set());

  const loadCheckinConfig = useCallback(async () => {
    try {
      const config = await api("/api/config");
      configLoaded.current = true;
      setStatus("online");
      setCheckinUrl(config.checkinUrl || config.localUrl + "/checkin");
    } catch {
      setStatus("offline");
    }
  }, []);

  const refreshCheckinView = useCallback(async () => {
    try {
      await refreshAttendanceStatus();
      // Re-read on every poll so the code and its QR roll over on their own at
      // midnight, without anyone having to reload the dashboard.
      const [data, code] = await Promise.all([
        api("/api/checkins?date=" + encodeURIComponent(todayKey())),
        api("/api/checkin/today"),
      ]);
      setStatus("online");
      setRows(data);
      setToday(code);
    } catch {
      setStatus("offline");
    }
  }, [refreshAttendanceStatus]);

  // Check-in polling: only while this view is open.
  useEffect(() => {
    if (activeView !== "checkin") return undefined;
    if (!configLoaded.current) loadCheckinConfig();
    refreshCheckinView();
    const timer = window.setInterval(refreshCheckinView, 5000);
    return () => window.clearInterval(timer);
  }, [activeView, loadCheckinConfig, refreshCheckinView]);

  const [title, hint] = CHECKIN_STATUS_COPY[status] || CHECKIN_STATUS_COPY.checking;
  // The QR now carries today's code, so its URL — and therefore the rendered
  // image — is different every day. v=2 busts caches holding the old rendering.
  const qrTarget = today.qrUrl || checkinUrl;
  const qrSrc = qrTarget ? "/api/qr?v=2&url=" + encodeURIComponent(qrTarget) : "";

  const copyUrl = async () => {
    if (!checkinUrl) return;
    try {
      await navigator.clipboard.writeText(checkinUrl);
      showToast("Check-in URL copied");
    } catch {
      showToast("Copy failed — select the URL manually");
    }
  };

  const seen = knownCheckinIds.current;
  const feed = rows.map((row) => {
    const member = findLocalMemberByQr(row);
    const known = Boolean(member);
    const name = member?.name || row.memberName || "Unknown member";
    return { row, member, known, name, isNew: !seen.has(row.id) };
  });
  rows.forEach((row) => seen.add(row.id));

  const retry = () => {
    setStatus("checking");
    loadCheckinConfig();
    refreshCheckinView();
  };
  const codeDate = today.date ? displayDate(today.date) : "Loading…";

  return (
    <section className="list-view checkin-view" aria-label="QR check-in">
      <div className={"checkin-pill is-" + status} id="checkinStatus" data-state={status} aria-live="polite">
        <span className="checkin-pill-dot" aria-hidden="true" />
        <div>
          <strong id="checkinStatusTitle">{title}</strong>
          <small id="checkinStatusHint">{hint}</small>
        </div>
        {status === "online" ? null : (
          <button className="checkin-pill-retry" id="checkinRetry" type="button" onClick={retry}>
            Retry
          </button>
        )}
      </div>

      <div className="checkin-layout">
        <section className="qr-card" aria-label="Today's QR">
          <div className="qr-card-head">
            <div>
              <span>Today&apos;s code</span>
              <strong>{today.code || "----"}</strong>
              <small>{codeDate}</small>
            </div>
            <button type="button" className="qr-card-present" onClick={() => setPresenting(true)} disabled={!qrSrc}>
              <Icon name="fullscreen" />
              Show at desk
            </button>
          </div>
          <div className="qr-card-code">
            {qrSrc ? <img id="checkinQrImage" alt="Check-in QR code" src={qrSrc} /> : <span className="qr-card-wait">Loading…</span>}
          </div>
          <p className="qr-card-hint">Members scan this at the front desk. The code changes every day at midnight.</p>
          <div className="qr-card-url">
            <span id="checkinUrlText">{checkinUrl || "Loading check-in link…"}</span>
            <button id="copyCheckinUrl" type="button" onClick={copyUrl} aria-label="Copy check-in link">
              <Icon name="content_copy" />
            </button>
          </div>
        </section>

        <section className="contact-group checkin-feed-group" aria-label="Today's check-ins">
          <h3 className="contact-group-title ledger-day-title">
            <span className="checkin-title">
              Today&apos;s check-ins <span id="checkinFeedCount" className="checkin-count">{rows.length}</span>
            </span>
            <button className="checkin-refresh" id="refreshCheckins" type="button" onClick={refreshCheckinView} aria-label="Refresh check-ins">
              <Icon name="refresh" />
            </button>
          </h3>
          {feed.length ? (
            <ul className="contact-list" id="checkinFeed">
              {feed.map(({ row, member, known, name, isNew }) => (
                <li key={row.id} className={isNew ? "is-new" : ""}>
                  <div className={"contact-row is-static " + (known ? "is-paid" : "is-pending")}>
                    <span className="contact-avatar">
                      {member ? (
                        <Photo person={member} />
                      ) : (
                        <span className="avatar-fallback">{getInitials(name)}</span>
                      )}
                    </span>
                    <span className="contact-copy">
                      <strong>
                        <span className="contact-name">{name}</span>
                        {known ? null : <em className="contact-tag warn">Not in list</em>}
                      </strong>
                      <small>{row.gymId || row.memberId || ""}</small>
                    </span>
                    <span className="contact-state">
                      <time className="checkin-time">{timeText(row.time)}</time>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="contact-empty">No check-ins yet today. They appear here within a few seconds of a scan.</p>
          )}
        </section>
      </div>

      <Dialog className="qr-present" open={presenting} onClose={() => setPresenting(false)}>
        <div className="qr-present-panel">
          <button className="qr-present-close" type="button" aria-label="Close" onClick={() => setPresenting(false)}>
            <Icon name="close" />
          </button>
          <p>Scan to check in</p>
          <div className="qr-present-code">{qrSrc ? <img alt="Check-in QR code" src={qrSrc} /> : null}</div>
          <span>Today&apos;s code</span>
          <strong>{today.code || "----"}</strong>
          <small>{codeDate}</small>
        </div>
      </Dialog>
    </section>
  );
}
