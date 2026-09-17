import AttendanceCard from "../components/AttendanceCard.jsx";
import InvoicesCard from "../components/InvoicesCard.jsx";
import MemberStatPills from "../components/MemberStatPills.jsx";
import NextDueCard from "../components/NextDueCard.jsx";
import { initials } from "../lib/format.js";
import { currentStreak, visitsThisMonth, weekStrip } from "../lib/memberStats.js";

/**
 * The member's home screen. Everything on it is derived from the one public
 * lookup the app already makes — attendance drives the streak, the visit count
 * and the week strip; payments drive the receipts; the server's billing summary
 * drives the renewal card.
 */
export default function MemberHome({ billing, gymName, history, member }) {
  const attendance = member.attendance || [];

  return (
    <div className="flex flex-col w-full gap-space-lg pb-8">
      <section className="flex flex-col gap-space-sm pt-2">
        <div className="flex items-center justify-between gap-space-sm">
          <div className="flex flex-col min-w-0">
            <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest font-bold">
              {member.gymId || "Member"}
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight mt-1 truncate">
              {member.name}
            </h1>
          </div>
          <div className="relative shrink-0">
            {member.photo ? (
              <img
                alt=""
                className="w-11 h-11 rounded-full object-cover ring-2 ring-primary/20 shadow-sm"
                src={member.photo}
              />
            ) : (
              <div className="w-11 h-11 rounded-full ring-2 ring-primary/20 shadow-sm bg-primary-tint text-primary flex items-center justify-center font-headline-sm text-sm font-bold">
                {initials(member.name)}
              </div>
            )}
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-surface-container-lowest ${
                billing?.expired ? "bg-red-500" : "bg-primary"
              }`}
            />
          </div>
        </div>

        <MemberStatPills
          daysLeft={billing ? billing.daysLeft : null}
          daysOverdue={billing ? billing.daysOverdue : null}
          expired={Boolean(billing?.expired)}
          streak={currentStreak(attendance)}
          visits={visitsThisMonth(attendance)}
        />
      </section>

      <NextDueCard billing={billing} />

      <AttendanceCard gymName={gymName} history={history} week={weekStrip(attendance)} />

      <InvoicesCard payments={member.payments || []} />
    </div>
  );
}
