import { useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Icon from "../components/Icon.jsx";
import Photo from "../components/Photo.jsx";
import { buildDashboard } from "../lib/dashboard.js";
import { currency, displayDate } from "../lib/dates.js";
import { getInitials } from "../lib/format.js";

const ATTENTION_LIMIT = 4;

function greeting(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function Delta({ value, suffix }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={"dash-delta " + (up ? "up" : "down")}>
      <Icon name={up ? "trending_up" : "trending_down"} />
      {Math.abs(value)}%{suffix ? <span className="dash-delta-suffix"> {suffix}</span> : null}
    </span>
  );
}

/* ---- Hero: greeting, month-to-date collection, money strip ---- */
function Hero({ data, settings }) {
  const now = new Date();
  const name = settings.gymName || "Your gym";
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "short" }).format(now);
  const { money, month, members } = data;

  return (
    <section className="dash-hero" aria-label="This month at a glance">
      <div className="dash-hero-head">
        <div>
          <p className="dash-hero-overline">
            {greeting(now.getHours())} · {dateLabel}
          </p>
          <h2>{name}</h2>
        </div>
        <div className="dash-hero-logo" aria-hidden="true">
          {settings.logo ? <img src={settings.logo} alt="" /> : getInitials(name) || "G"}
        </div>
      </div>

      <div className="dash-hero-card">
        <div className="dash-hero-metric">
          <span className="dash-overline">Collected in {month.name}</span>
          <div className="dash-hero-value">
            <strong>{currency(money.collected)}</strong>
            <Delta value={money.collectedDelta} />
          </div>
          <small>
            {money.previousToDate > 0
              ? `vs ${currency(money.previousToDate)} by ${month.dayOfMonth} ${month.prevName}`
              : `Day ${month.dayOfMonth} of ${month.daysInMonth}`}
          </small>
        </div>
      </div>

      <dl className="dash-hero-stats">
        <div>
          <dt>Pending dues</dt>
          <dd>{currency(members.overdueAmount)}</dd>
        </div>
        <div>
          <dt>Expenses</dt>
          <dd>{currency(money.spent)}</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd className={money.net < 0 ? "is-negative" : ""}>{currency(money.net)}</dd>
        </div>
      </dl>
    </section>
  );
}

/* ---- KPI cards ---- */
function Kpi({ tone, icon, label, value, onClick, children, className = "" }) {
  return (
    <button type="button" className={`dash-kpi ${tone} ${className}`.trim()} onClick={onClick}>
      <span className="dash-kpi-head">
        <span className="dash-kpi-icon">
          <Icon name={icon} />
        </span>
        <span className="dash-kpi-label">{label}</span>
      </span>
      <strong className="dash-kpi-value">{value}</strong>
      <span className="dash-kpi-foot">{children}</span>
    </button>
  );
}

function Meter({ value, label }) {
  return (
    <>
      <span className="dash-meter" aria-hidden="true">
        <i style={{ width: `${value}%` }} />
      </span>
      <span>{label}</span>
    </>
  );
}

/* ---- Last 7 days of check-ins ---- */
function WeekChart({ attendance }) {
  const [selected, setSelected] = useState(6);
  const max = Math.max(1, ...attendance.week.map((day) => day.count));
  const pick = attendance.week[selected];

  return (
    <section className="dash-card dash-week">
      <header className="dash-card-head">
        <div>
          <h3>Check-ins</h3>
          <p>Last 7 days</p>
        </div>
        <div className="dash-card-figure">
          <strong>{attendance.weekTotal}</strong>
          <Delta value={attendance.weekDelta} suffix="vs prev." />
        </div>
      </header>

      <div className="dash-bars" role="group" aria-label="Check-ins per day, last 7 days">
        {attendance.week.map((day, index) => (
          <button
            key={day.key}
            type="button"
            className={
              "dash-bar" +
              (index === selected ? " is-selected" : "") +
              (day.isToday ? " is-today" : "") +
              (day.holiday ? " is-holiday" : "")
            }
            aria-label={`${day.label}: ${day.count} check-in${day.count === 1 ? "" : "s"}${day.holiday ? " (holiday)" : ""}`}
            aria-pressed={index === selected}
            onClick={() => setSelected(index)}
          >
            <span className="dash-bar-track">
              <span className="dash-bar-fill" style={{ height: `${(day.count / max) * 100}%` }}>
                {index === selected ? <span className="dash-bar-value">{day.count}</span> : null}
              </span>
            </span>
            <span className="dash-bar-label">{day.isToday ? "Today" : day.weekday}</span>
          </button>
        ))}
      </div>
      <p className="dash-bars-caption">
        {pick.label}
        {pick.holiday ? " · Holiday" : ""}
      </p>

      <dl className="dash-card-stats">
        <div>
          <dt>This month</dt>
          <dd>{attendance.monthVisits} visits</dd>
        </div>
        <div>
          <dt>Daily avg.</dt>
          <dd>{attendance.dailyAverage.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Best day</dt>
          <dd>{attendance.bestDay ? displayDate(attendance.bestDay.key).slice(0, 6) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

/* ---- Fee status ring: paid up / overdue / not due yet ---- */
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;
const RING_GAP = 3;

function FeeRing({ members, onOpen }) {
  const upcoming = Math.max(0, members.total - members.paidUp - members.overdueCount);
  const parts = [
    { key: "paid", label: "Paid up", count: members.paidUp },
    { key: "overdue", label: "Overdue", count: members.overdueCount, extra: currency(members.overdueAmount) },
    { key: "upcoming", label: "Not due yet", count: upcoming },
  ];
  const shown = parts.filter((part) => part.count > 0);
  let offset = 0;

  return (
    <section className="dash-card dash-fees">
      <header className="dash-card-head">
        <div>
          <h3>Fee status</h3>
          <p>Current billing period</p>
        </div>
        <button type="button" className="dash-link" onClick={onOpen}>
          Payments
          <Icon name="chevron_right" />
        </button>
      </header>

      <div className="dash-fees-body">
        <div className="dash-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r={RING_R} className="dash-ring-track" />
            {shown.map((part) => {
              const length = (part.count / Math.max(1, members.total)) * RING_C;
              const gap = shown.length > 1 ? RING_GAP : 0;
              const segment = (
                <circle
                  key={part.key}
                  cx="50"
                  cy="50"
                  r={RING_R}
                  className={"dash-ring-seg " + part.key}
                  strokeDasharray={`${Math.max(0, length - gap)} ${RING_C}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return segment;
            })}
          </svg>
          <div className="dash-ring-center">
            <strong>
              {members.paidUp}
              <span>/{members.total}</span>
            </strong>
            <small>paid up</small>
          </div>
        </div>

        <ul className="dash-legend">
          {parts.map((part) => (
            <li key={part.key} className={part.key}>
              <i aria-hidden="true" />
              <span>{part.label}</span>
              <strong>{part.count}</strong>
              {part.extra && part.count ? <small>{part.extra}</small> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---- Overdue members, largest dues first ---- */
function Attention({ members, onCollect, onViewAll }) {
  const rows = members.overdue.slice(0, ATTENTION_LIMIT);

  return (
    <section className="dash-card dash-attention">
      <header className="dash-card-head">
        <div>
          <h3>Needs attention</h3>
          <p>
            {members.overdueCount
              ? `${members.overdueCount} member${members.overdueCount === 1 ? "" : "s"} with dues`
              : "Overdue fees"}
          </p>
        </div>
        {members.overdueCount > ATTENTION_LIMIT ? (
          <button type="button" className="dash-link" onClick={onViewAll}>
            View all
            <Icon name="chevron_right" />
          </button>
        ) : null}
      </header>

      {rows.length ? (
        <ul className="dash-attention-list">
          {rows.map(({ member, amount, periods, since }) => (
            <li key={member.id}>
              <button type="button" className="dash-attention-row" onClick={() => onCollect(member.id)}>
                <Photo person={member} />
                <span className="dash-attention-copy">
                  <strong>{member.name}</strong>
                  <small>
                    {periods} period{periods === 1 ? "" : "s"} · since {displayDate(since).slice(0, 6)}
                  </small>
                </span>
                <span className="dash-attention-amount">
                  <strong>{currency(amount)}</strong>
                  <small>Collect</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dash-all-clear">
          <span className="dash-all-clear-icon">
            <Icon name="verified" className="filled" />
          </span>
          <div>
            <strong>All caught up</strong>
            <small>No member has overdue fees.</small>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DashboardView() {
  const { members, trainers, expenses, settings, domain, setView, openFeeDialog, openExpenseDialog } = useApp();
  const data = useMemo(() => buildDashboard({ members, expenses, domain }), [members, expenses, domain]);
  const m = data.members;
  const activeTrainers = trainers.filter((trainer) => trainer.status !== "inactive").length;
  const presentPct = percent(m.present, m.total);
  const paidPct = percent(m.paid, m.total);

  return (
    <div className="dash">
      <Hero data={data} settings={settings} />

      <section className="dash-kpis" aria-label="Gym summary">
        <Kpi tone="members" icon="groups" label="Members" value={m.total} onClick={() => setView("members")}>
          {m.joinedThisMonth ? (
            <span className="dash-kpi-up">
              <Icon name="arrow_upward" />
              {m.joinedThisMonth} joined in {data.month.shortName}
            </span>
          ) : (
            "Registered"
          )}
        </Kpi>
        <Kpi tone="present" icon="how_to_reg" label="Present today" value={m.present} onClick={() => setView("attendance")}>
          <Meter value={presentPct} label={`${presentPct}% of members`} />
        </Kpi>
        <Kpi tone="paid" icon="payments" label="Paid this month" value={m.paid} onClick={() => setView("payments")}>
          <Meter value={paidPct} label={`${m.paid} of ${m.total} members`} />
        </Kpi>
        <Kpi tone="due" icon="error" label="Overdue" value={m.overdueCount} onClick={() => setView("payments")}>
          {m.overdueCount ? <span className="dash-kpi-due">{currency(m.overdueAmount)} pending</span> : "Nothing pending"}
        </Kpi>
        <Kpi
          tone="trainers"
          icon="exercise"
          label="Active trainers"
          value={activeTrainers}
          className="dash-kpi-desktop"
          onClick={() => setView("trainers")}
        >
          {trainers.length} total trainer{trainers.length === 1 ? "" : "s"}
        </Kpi>
      </section>

      <nav className="dash-quick" aria-label="Quick actions">
        <button type="button" onClick={() => setView("attendance")}>
          <span>
            <Icon name="how_to_reg" />
          </span>
          Attendance
        </button>
        <button type="button" onClick={() => setView("checkin")}>
          <span>
            <Icon name="qr_code_scanner" />
          </span>
          QR Check-in
        </button>
        <button type="button" onClick={() => setView("payments")}>
          <span>
            <Icon name="currency_rupee" />
          </span>
          Collect fee
        </button>
        <button type="button" onClick={() => openExpenseDialog()}>
          <span>
            <Icon name="receipt_long" />
          </span>
          Add expense
        </button>
      </nav>

      <div className="dash-grid">
        <WeekChart attendance={data.attendance} />
        <FeeRing members={m} onOpen={() => setView("payments")} />
        <Attention members={m} onCollect={openFeeDialog} onViewAll={() => setView("payments")} />
      </div>
    </div>
  );
}
