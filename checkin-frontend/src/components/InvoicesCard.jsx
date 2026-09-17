import { useState } from "react";
import { displayDate } from "../lib/format.js";
import { rupees } from "../lib/memberStats.js";
import Icon from "./Icon.jsx";

const PREVIEW_ROWS = 2;

// Newest first. Payments are only ever written once collected, so every row here
// is settled — there is no pending state to show.
const byNewest = (payments) => [...payments].sort((a, b) => String(b.date).localeCompare(String(a.date)));

export default function InvoicesCard({ payments = [] }) {
  const [expanded, setExpanded] = useState(false);
  const ordered = byNewest(payments);
  const rows = expanded ? ordered : ordered.slice(0, PREVIEW_ROWS);
  const canExpand = ordered.length > PREVIEW_ROWS;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">Recent receipts</h2>
        {canExpand && (
          <button
            className="font-label-sm text-label-sm text-primary font-semibold"
            onClick={() => setExpanded((open) => !open)}
            type="button"
          >
            {expanded ? "Show less" : "View all"}
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-surface-container-lowest p-space-md shadow-xs border border-surface-container-high flex flex-col gap-2.5">
        {rows.length ? (
          rows.map((payment, index) => (
            <div key={`${payment.date}-${payment.billingPeriod || index}`}>
              {index > 0 && <div className="h-[1px] w-full bg-surface-container-low mb-2.5" />}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`text-[20px] shrink-0 ${index === 0 ? "text-primary" : "text-secondary"}`}
                    name="receipt"
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-label-md text-label-md text-on-surface font-semibold truncate">
                      {displayDate(payment.date)}
                    </span>
                    <span className="font-body-sm text-body-sm text-secondary truncate">
                      {rupees(payment.amount)} •{" "}
                      {payment.kind === "admission" ? "Admission fee" : "Membership"}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full font-label-sm font-semibold shrink-0 ${
                    index === 0
                      ? "bg-primary-fixed text-on-primary-fixed"
                      : "bg-surface-container text-secondary"
                  }`}
                >
                  Paid
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="flex items-center justify-center gap-1.5 py-2 text-body-sm text-secondary">
            <Icon className="text-[16px]" name="receipt_long" />
            No payments recorded yet.
          </p>
        )}
      </div>
    </section>
  );
}
