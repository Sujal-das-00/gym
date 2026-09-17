import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { currency, displayDate, localDateKey, parseDateKey, todayKey } from "../lib/dates.js";

export default function DetailDialog() {
  const {
    members,
    trainers,
    domain,
    detailMemberId,
    closeDetail,
    openMemberDialog,
    attendanceDate,
    setMemberAttendanceStatus,
  } = useApp();

  const member = members.find((item) => item.id === detailMemberId);
  const open = Boolean(member);

  const getTrainerName = (id) => trainers.find((trainer) => trainer.id === id)?.name || "No trainer assigned";

  const getLastPaymentText = () => {
    const payments = member.payments || [];
    if (!payments.length) return "No payment";
    return displayDate(payments[payments.length - 1].date);
  };

  // The calendar follows the month picked on the Mark Attendance sheet.
  const renderCalendar = () => {
    const current = parseDateKey(attendanceDate || todayKey());
    const year = current.getFullYear();
    const month = current.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const attendance = new Set(member.attendance || []);
    const today = todayKey();
    const monthName = new Intl.DateTimeFormat("en-IN", { month: "long" }).format(current);

    const cells = Array.from({ length: daysInMonth }, (unused, index) => {
      const day = index + 1;
      const key = localDateKey(new Date(year, month, day));
      const classes = ["day-cell"];
      if (attendance.has(key)) classes.push("present");
      // Holiday shading follows the Settings panel (weekly days + specific dates);
      // a check-in on a holiday still renders as present.
      else if (domain.isHoliday(key)) classes.push("holiday");
      if (key === today) classes.push("today");
      return { day, key, className: classes.join(" ") };
    });

    return { cells, monthName };
  };

  if (!open) {
    return <Dialog className="detail-dialog" id="detailDialog" open={false} onClose={closeDetail} />;
  }

  const { cells, monthName } = renderCalendar();
  const payments = [...(member.payments || [])].reverse();

  return (
    <Dialog className="detail-dialog" id="detailDialog" open={open} onClose={closeDetail}>
      <div className="detail-panel">
        <div className="dialog-head">
          <div className="member-title">
            <img
              id="detailPhoto"
              alt=""
              src={member.photo || ""}
              style={{ display: member.photo ? "block" : "none" }}
            />
            <div>
              <p className="eyebrow" id="detailStatus">
                {domain.isOverdue(member)
                  ? "Payment overdue"
                  : domain.isPaidThisPeriod(member)
                    ? "Paid this period"
                    : "Active member"}
              </p>
              <h2 id="detailName">{member.name}</h2>
              <p id="detailMeta">
                {`${member.phone} · ${member.address} · Trainer: ${getTrainerName(member.trainerId)}`}
              </p>
            </div>
          </div>
          <button className="icon-button" id="closeDetail" aria-label="Close" type="button" onClick={closeDetail}>
            ×
          </button>
        </div>

        <div className="detail-actions">
          <button
            className="secondary-action"
            id="editMember"
            type="button"
            // The original stacked the edit dialog on top of this one rather
            // than closing it, so returning from the edit lands back here.
            onClick={() => openMemberDialog(member)}
          >
            Edit details
          </button>
        </div>

        <section className="detail-grid">
          <article>
            <span>Fee</span>
            <strong id="detailFee">{currency(member.fee)}</strong>
          </article>
          <article>
            <span>{domain.isOverdue(member) ? "Overdue since" : "Next due date"}</span>
            <strong id="detailDueDate">{displayDate(domain.getDueDateKey(member))}</strong>
          </article>
          <article>
            <span>This month attendance</span>
            <strong id="detailAttendance">{domain.getMonthlyAttendance(member)} days</strong>
          </article>
          <article>
            <span>Last payment</span>
            <strong id="detailLastPayment">{getLastPaymentText()}</strong>
          </article>
          {/* Only shown when the gym actually charged a joining fee. */}
          {Number(member.admissionFee || 0) > 0 ? (
            <article>
              <span>Admission fee</span>
              <strong id="detailAdmissionFee">{currency(member.admissionFee)}</strong>
            </article>
          ) : null}
        </section>

        <section className="calendar-section">
          <div className="panel-head compact">
            <div>
              <h3>Attendance calendar</h3>
              <p id="calendarHint">
                {monthName} attendance for {member.name}
              </p>
            </div>
          </div>
          <div className="calendar-grid" id="attendanceCalendar">
            {cells.map((cell) => (
              <button
                key={cell.key}
                className={cell.className}
                type="button"
                onClick={() => setMemberAttendanceStatus(member.id, cell.key, !domain.hasAttendance(member, cell.key))}
              >
                {cell.day}
              </button>
            ))}
          </div>
        </section>

        <section className="payment-history">
          <h3>Payment history</h3>
          <div id="paymentHistory">
            {payments.length ? (
              payments.map((payment) => (
                <div className="payment-row" key={payment.id}>
                  <strong>{currency(payment.amount)}</strong>
                  <span>{`${domain.getPaymentLabel(payment, member)} · ${displayDate(payment.date)}`}</span>
                </div>
              ))
            ) : (
              <p className="muted">No payments recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
