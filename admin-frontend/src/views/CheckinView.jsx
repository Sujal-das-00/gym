import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { api } from "../lib/api.js";
import { CHECKIN_STATUS_COPY } from "../lib/constants.js";
import { displayDate, timeText, todayKey } from "../lib/dates.js";
import { getInitials } from "../lib/format.js";

export default function CheckinView() {
  const { activeView, findLocalMemberByQr, refreshAttendanceStatus, showToast } = useApp();
  const [status, setStatus] = useState("checking");
  const [checkinUrl, setCheckinUrl] = useState("");
  const [today, setToday] = useState({ code: "", date: "", qrUrl: "" });
  const [rows, setRows] = useState([]);
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
    return { row, known, name, isNew: !seen.has(row.id) };
  });
  rows.forEach((row) => seen.add(row.id));

  return (
    <>
      <section className="panel checkin-status-panel" aria-live="polite">
        <div className="checkin-status" id="checkinStatus" data-state={status}>
          <span className="status-dot"></span>
          <div>
            <strong id="checkinStatusTitle">{title}</strong>
            <p id="checkinStatusHint">{hint}</p>
          </div>
          <button
            className="secondary-action"
            id="checkinRetry"
            type="button"
            onClick={() => {
              setStatus("checking");
              loadCheckinConfig();
              refreshCheckinView();
            }}
          >
            Retry
          </button>
        </div>
      </section>

      <section className="checkin-grid">
        <section className="panel checkin-qr-panel">
          <div className="panel-head compact">
            <div>
              <h2>Today's QR</h2>
              <p>Place this on the front desk. The code and QR both change every day.</p>
            </div>
          </div>
          <div className="today-code">
            <span className="today-code-label">Today's code</span>
            <strong className="today-code-value">{today.code || "----"}</strong>
            <span className="today-code-date">{today.date ? displayDate(today.date) : "Loading…"}</span>
          </div>
          <div className="qr-frame">
            <img id="checkinQrImage" alt="Check-in QR code" src={qrSrc || undefined} />
          </div>
          <div className="checkin-url-row">
            <span id="checkinUrlText">{checkinUrl || "Loading check-in URL…"}</span>
            <button className="secondary-action" id="copyCheckinUrl" type="button" onClick={copyUrl}>
              Copy
            </button>
          </div>
          <ol className="checkin-steps">
            <li>Member scans the QR — today's code fills in for them.</li>
            <li>Or they open the URL and type the code above by hand.</li>
            <li>They enter their mobile number or Gym ID and confirm.</li>
            <li>The check-in appears here and is added to attendance automatically.</li>
          </ol>
        </section>

        <section className="panel checkin-feed-panel">
          <div className="panel-head">
            <div>
              <h2>Today's check-ins</h2>
              <p id="checkinFeedCount">
                {rows.length} check-in{rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <button className="primary-action" id="refreshCheckins" type="button" onClick={refreshCheckinView}>
              Refresh
            </button>
          </div>
          <div className="checkin-feed" id="checkinFeed">
            {feed.length ? (
              feed.map(({ row, known, name, isNew }) => (
                <div key={row.id} className={"checkin-feed-row " + (isNew ? "is-new" : "")}>
                  <div className={"feed-avatar " + (known ? "" : "unknown")}>{getInitials(name)}</div>
                  <div>
                    <strong>{name}</strong>
                    <span>
                      {row.gymId || row.memberId || ""}
                      {known ? "" : " · not in dashboard"}
                    </span>
                  </div>
                  <time>{timeText(row.time)}</time>
                </div>
              ))
            ) : (
              <p className="history-empty">No check-ins yet today. Scanned entries will show up here.</p>
            )}
          </div>
        </section>
      </section>
    </>
  );
}
