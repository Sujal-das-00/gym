import { useApp, useDialogs } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import Photo from "../components/Photo.jsx";
import Icon from "../components/Icon.jsx";
import WhatsAppIcon from "../components/WhatsAppIcon.jsx";
import { currency, dateFormatter, displayDate, localDateKey, parseDateKey, todayKey } from "../lib/dates.js";
import { sendFeeReminder, sendLoginDetails } from "../lib/whatsapp.js";

/** Member profile sheet: status, quick actions, key numbers, attendance and payments. */
export default function DetailDialog() {
  const {
    members,
    trainers,
    domain,
    closeDetail,
    openMemberDialog,
    openFeeDialog,
    attendanceDate,
    setMemberAttendanceStatus,
    user,
    gyms,
    gymId,
    settings,
  } = useApp();
  const { detailMemberId } = useDialogs();

  const member = members.find((item) => item.id === detailMemberId);
  const open = Boolean(member);

  if (!open) {
    return <Dialog className="sheet member-sheet" id="detailDialog" open={false} onClose={closeDetail} />;
  }

  // The calendar follows the month picked on the Mark Attendance sheet.
  const current = parseDateKey(attendanceDate || todayKey());
  const year = current.getFullYear();
  const month = current.getMonth();
  const monthName = dateFormatter({ month: "long" }).format(current);
  const attendance = new Set(member.attendance || []);
  const today = todayKey();
  const cells = Array.from({ length: new Date(year, month + 1, 0).getDate() }, (unused, index) => {
    const key = localDateKey(new Date(year, month, index + 1));
    const classes = ["day-cell"];
    if (attendance.has(key)) classes.push("present");
    // Holiday shading follows the Settings panel (weekly days + specific dates);
    // a check-in on a holiday still renders as present.
    else if (domain.isHoliday(key)) classes.push("holiday");
    if (key === today) classes.push("today");
    return { day: index + 1, key, className: classes.join(" ") };
  });

  const overdue = domain.isOverdue(member);
  const paid = domain.isPaidThisPeriod(member);
  const status = overdue ? "overdue" : paid ? "paid" : "pending";
  const hasDues = domain.getUnpaidPeriods(member).length > 0;
  const trainer = trainers.find((item) => item.id === member.trainerId)?.name || "";
  const payments = [...(member.payments || [])].reverse();
  const lastPayment = payments[0];
  const gymSlug = user?.gym?.slug || gyms.find((gym) => gym.id === gymId)?.slug || "";

  const actions = [
    hasDues && { key: "collect", icon: "currency_rupee", label: "Collect", primary: true, run: () => openFeeDialog(member.id) },
    { key: "edit", icon: "edit", label: "Edit", run: () => openMemberDialog(member) },
    {
      key: "login",
      icon: "key",
      label: "Send login",
      run: () => sendLoginDetails(member, { gymName: settings?.gymName, gymSlug }),
    },
    hasDues && { key: "remind", whatsapp: true, label: "Remind", run: () => sendFeeReminder(member, domain) },
  ].filter(Boolean);

  return (
    <Dialog className="sheet member-sheet" id="detailDialog" open={open} onClose={closeDetail}>
      <div className="sheet-panel">
        <header className="sheet-head">
          <span className="sheet-grabber" aria-hidden="true" />
          <h2>Member</h2>
          <button className="sheet-close" id="closeDetail" aria-label="Close" type="button" onClick={closeDetail}>
            <Icon name="close" />
          </button>
        </header>

        <div className="sheet-body">
          <div className="sheet-member">
            <span className="contact-avatar">
              <Photo person={member} />
            </span>
            <div>
              <strong id="detailName">{member.name}</strong>
              <small>{[member.phone, domain.getMembershipLabel(member)].filter(Boolean).join(" · ")}</small>
            </div>
            <span className={"status-pill " + status} id="detailStatus">
              {overdue ? "Overdue" : paid ? "Paid" : "Pending"}
            </span>
          </div>

          {/* Fee and edit dialogs stack on top of this one, so closing them lands back here. */}
          <div className="sheet-actions">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                id={action.key === "edit" ? "editMember" : undefined}
                className={action.primary ? "is-primary" : action.whatsapp ? "is-whatsapp" : ""}
                onClick={action.run}
              >
                <span>{action.whatsapp ? <WhatsAppIcon size={22} /> : <Icon name={action.icon} />}</span>
                {action.label}
              </button>
            ))}
          </div>

          <dl className="member-stats">
            <div>
              <dt>Fee</dt>
              <dd id="detailFee">{currency(member.fee)}</dd>
            </div>
            <div className={overdue ? "is-due" : ""}>
              <dt>{overdue ? "Overdue since" : "Next due"}</dt>
              <dd id="detailDueDate">{displayDate(domain.getDueDateKey(member))}</dd>
            </div>
            <div>
              <dt>Visits this month</dt>
              <dd id="detailAttendance">{domain.getMonthlyAttendance(member)}</dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd id="detailJoined">{displayDate(member.startDate)}</dd>
            </div>
            <div>
              <dt>Trainer</dt>
              <dd id="detailTrainer">{trainer || "Not assigned"}</dd>
            </div>
            <div>
              <dt>Last payment</dt>
              <dd id="detailLastPayment">{lastPayment ? displayDate(String(lastPayment.date).slice(0, 10)) : "None yet"}</dd>
            </div>
            {/* Only shown when the gym actually charged a joining fee. */}
            {Number(member.admissionFee || 0) > 0 ? (
              <div>
                <dt>Admission fee</dt>
                <dd id="detailAdmissionFee">{currency(member.admissionFee)}</dd>
              </div>
            ) : null}
          </dl>

          {member.address ? (
            <ul className="member-facts">
              {member.address ? (
                <li>
                  <Icon name="location_on" />
                  {member.address}
                </li>
              ) : null}
            </ul>
          ) : null}

          <section className="sheet-section">
            <div className="sheet-section-head">
              <h3>Attendance · {monthName}</h3>
              <small className="member-calendar-hint">Tap a day to mark</small>
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

          <details className="sheet-history" open>
            <summary>
              Payment history
              <Icon name="expand_more" />
            </summary>
            {payments.length ? (
              <ul id="paymentHistory">
                {payments.map((payment) => (
                  <li key={payment.id}>
                    <span>
                      <strong>{domain.getPaymentLabel(payment, member)}</strong>
                      <small>
                        {[displayDate(String(payment.date || "").slice(0, 10)), domain.paymentModeLabel(payment.mode)]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    <strong>{currency(payment.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="member-empty">No payments recorded yet.</p>
            )}
          </details>
        </div>
      </div>
    </Dialog>
  );
}
