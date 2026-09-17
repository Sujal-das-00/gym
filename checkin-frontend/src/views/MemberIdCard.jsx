import Icon from "../components/Icon.jsx";
import { displayDate, displayPhone, initials } from "../lib/format.js";
import { rupees } from "../lib/memberStats.js";

function DetailRow({ icon, label, children }) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
        <Icon className="text-primary text-[18px]" name={icon} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-label-sm text-label-sm text-secondary uppercase">{label}</span>
        {children}
      </div>
    </div>
  );
}

function Tile({ label, value, note, tone }) {
  return (
    <div className="p-3 rounded-xl bg-surface-container-low flex flex-col justify-between">
      <span className="font-label-sm text-label-sm text-secondary">{label}</span>
      <span
        className={`font-label-md text-label-md font-semibold mt-1 ${
          tone === "brand" ? "text-primary" : tone === "danger" ? "text-red-600" : "text-on-surface"
        }`}
      >
        {value}
      </span>
      {note && <span className="font-body-sm text-body-sm text-secondary">{note}</span>}
    </div>
  );
}

/**
 * The member's digital gym ID: who they are, and the plan the front desk would
 * otherwise have to look up.
 *
 * The template this came from also carried an "assigned personal trainer" card.
 * Nothing backs it — trainers exist only as an expense category, with no trainer
 * records and no link to a member — so it is left out rather than invented.
 */
export default function MemberIdCard({ billing, gymName, member }) {
  const expired = Boolean(billing?.expired);
  const isPackage = member.membershipType === "package";
  const admissionPaid = (member.payments || []).some((payment) => payment.kind === "admission");

  return (
    <div className="flex flex-col w-full pb-8 space-y-4 pt-4">
      <div className="relative w-full rounded-2xl bg-surface-container-lowest p-6 shadow-sm border border-surface-container flex flex-col items-center text-center overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-primary-fixed/30 to-transparent pointer-events-none" />

        <div className="relative mt-2 mb-3">
          {member.photo ? (
            <img
              alt=""
              className="w-24 h-24 rounded-full object-cover shadow-md ring-4 ring-primary/20 mx-auto"
              src={member.photo}
            />
          ) : (
            <div className="w-24 h-24 rounded-full shadow-md ring-4 ring-primary/20 mx-auto bg-primary-tint text-primary flex items-center justify-center font-headline-lg text-2xl font-bold">
              {initials(member.name)}
            </div>
          )}
          <span
            className={`absolute bottom-0 right-1 p-1.5 rounded-full text-on-primary flex items-center justify-center shadow-sm ring-2 ring-surface-container-lowest ${
              expired ? "bg-red-500" : "bg-primary"
            }`}
            title={expired ? "Membership expired" : "Active member"}
          >
            <Icon className="text-[14px]" name={expired ? "priority_high" : "verified"} />
          </span>
        </div>

        <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
          {member.name}
        </h2>
        <div className="flex items-center justify-center flex-wrap gap-2 mt-1">
          <span className="font-label-md text-label-md font-mono text-primary font-semibold">
            ID: {member.gymId}
          </span>
          <span className="font-label-sm text-label-sm px-2.5 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-bold">
            {gymName}
          </span>
        </div>

        <div className="w-full mt-5 pt-4 border-t border-surface-container-high/60 grid grid-cols-2 gap-3 text-left">
          <DetailRow icon="phone_iphone" label="Mobile">
            <span className="font-label-md text-label-md text-on-surface font-semibold font-mono break-words">
              {displayPhone(member.phone)}
            </span>
          </DetailRow>
          <DetailRow icon="home_pin" label="Address">
            <span className="font-label-md text-label-md text-on-surface font-semibold break-words">
              {member.address || "Not on file"}
            </span>
          </DetailRow>
        </div>
      </div>

      <div className="flex flex-col space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold">
            Membership &amp; plan details
          </span>
          <span
            className={`font-label-sm text-label-sm font-semibold px-2 py-0.5 rounded-full shrink-0 ${
              expired ? "bg-red-50 text-red-700" : "bg-primary-fixed/40 text-primary"
            }`}
          >
            {expired
              ? `Overdue by ${billing?.daysOverdue ?? 0} day${billing?.daysOverdue === 1 ? "" : "s"}`
              : billing
                ? `Active • ${billing.daysLeft} days left`
                : "Active"}
          </span>
        </div>

        <div className="flex flex-col rounded-2xl bg-surface-container-lowest shadow-sm border border-surface-container p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="text-primary text-[20px]" name="card_membership" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-label-sm text-label-sm text-secondary uppercase">
                Membership type
              </span>
              <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                {billing ? billing.planLabel : isPackage ? "Package" : "Monthly"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-surface-container-high/60">
            <Tile label="Joined" value={displayDate(member.startDate)} />
            <Tile
              label="Next due date"
              note={expired ? `Overdue by ${billing?.daysOverdue ?? 0}d` : undefined}
              tone={expired ? "danger" : "brand"}
              value={displayDate(billing?.nextDueDate)}
            />
            <Tile
              label="Admission fee"
              note={
                member.admissionFee > 0
                  ? `One-time • ${admissionPaid ? "Paid" : "Not recorded"}`
                  : undefined
              }
              value={member.admissionFee > 0 ? rupees(member.admissionFee) : "Not charged"}
            />
            <Tile
              label={isPackage ? "Package fee" : "Monthly dues"}
              tone="brand"
              value={rupees(member.fee)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
