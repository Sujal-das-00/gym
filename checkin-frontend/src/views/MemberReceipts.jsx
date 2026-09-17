import { useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";
import { displayDate } from "../lib/format.js";
import { rupees } from "../lib/memberStats.js";
import { downloadInvoice, paymentMode, paymentTitle } from "../lib/receipt.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "membership", label: "Membership" },
  { id: "admission", label: "Admission" },
];

/**
 * Every payment the gym has recorded for this member, newest first.
 *
 * A payment row only exists once an admin has recorded money collected at the
 * front desk, so each one is a settled receipt — there is no pending or unpaid
 * state to render here. Money still owed shows up as dues on the home screen
 * instead, never as an invoice.
 */
export default function MemberReceipts({ gymName, member }) {
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    // Several periods are often recorded on the same day, so the paid-on date
    // alone leaves the rows in arbitrary order — fall back to the period.
    const ordered = [...(member.payments || [])].sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.billingPeriod || "").localeCompare(String(a.billingPeriod || "")),
    );
    return filter === "all" ? ordered : ordered.filter((payment) => payment.kind === filter);
  }, [filter, member.payments]);

  const total = rows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  return (
    <div className="flex flex-col w-full pb-10 space-y-space-lg pt-4">
      <div className="flex flex-col space-y-space-md">
        <div>
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
            Billing &amp; receipts
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
            Payments collected at the front desk and recorded by {gymName}.
          </p>
        </div>

        <div className="flex items-center gap-space-xs overflow-x-auto py-1 scrollbar-none">
          {FILTERS.map((option) => {
            const selected = filter === option.id;
            return (
              <button
                className={`px-3 py-1.5 rounded-full font-label-sm text-label-sm font-semibold whitespace-nowrap transition-colors ${
                  selected
                    ? "bg-on-surface text-surface shadow-sm"
                    : "bg-surface-container text-on-surface-variant"
                }`}
                key={option.id}
                onClick={() => setFilter(option.id)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col space-y-space-sm">
        <div className="flex items-center justify-between gap-2 px-1">
          <h3 className="font-headline-sm text-headline-sm text-on-surface">Past transactions</h3>
          <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0">
            {rows.length} {rows.length === 1 ? "record" : "records"} • {rupees(total)}
          </span>
        </div>

        {rows.length ? (
          <div className="space-y-space-xs">
            {rows.map((payment) => (
              <div
                className="bg-surface-container-lowest rounded-xl p-space-sm shadow-xs border border-surface-container flex items-center gap-space-sm"
                key={payment.id}
              >
                <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-primary shrink-0">
                  <Icon className="text-[18px]" name="receipt_long" />
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-label-md text-label-md text-on-surface truncate font-semibold">
                    {paymentTitle(payment)}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span className="font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                      Paid {displayDate(payment.date)}
                    </span>
                    {paymentMode(payment) && (
                      <>
                        <span className="text-outline-variant text-xs">•</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {paymentMode(payment)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-space-sm shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                      {rupees(payment.amount)}
                    </span>
                    <span className="font-label-sm text-label-sm text-primary font-semibold">Paid</span>
                  </div>
                  <button
                    aria-label={`Download invoice for ${paymentTitle(payment)}`}
                    className="w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant hover:text-primary hover:bg-primary-fixed/40 transition-colors flex items-center justify-center"
                    onClick={() => downloadInvoice({ gymName, member, payment })}
                    title="Download invoice as PDF"
                    type="button"
                  >
                    <Icon className="text-[18px]" name="download" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-xs border border-surface-container flex flex-col items-center gap-1.5 text-center">
            <Icon className="text-secondary text-[22px]" name="receipt_long" />
            <p className="font-body-sm text-body-sm text-secondary">
              {filter === "all"
                ? "No payments recorded yet. Receipts appear here once the front desk records your payment."
                : "No payments of this kind yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
