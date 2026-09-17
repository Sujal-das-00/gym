import { useMemo } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { currency } from "../lib/dates.js";
import { buildLedgerEntries, filterEntriesByDate, summarizeEntries } from "../lib/ledger.js";
import { dayLabel } from "../lib/period.js";
import Icon from "../components/Icon.jsx";

/**
 * The "Read more" window behind a day row on the Insights screen: every single
 * earning and expense recorded on that one date, named and signed, so the
 * admin can see exactly what made up the day's total.
 */
export default function DayLedgerDialog() {
  const { dayLedgerDate, closeDayLedger, members, expenses, domain, openDetail, openExpenseDialog } = useApp();
  const open = Boolean(dayLedgerDate);

  const entries = useMemo(() => {
    if (!dayLedgerDate) return [];
    return filterEntriesByDate(buildLedgerEntries({ members, expenses, domain }), dayLedgerDate, dayLedgerDate);
  }, [dayLedgerDate, members, expenses, domain]);

  const totals = summarizeEntries(entries);

  // Opening a member or expense from here replaces this window, so the admin
  // lands on the record itself instead of stacking dialogs.
  const openEntry = (entry) => {
    closeDayLedger();
    if (entry.type === "earning") {
      if (entry.memberId) openDetail(entry.memberId);
      return;
    }
    const expense = expenses.find((item) => item.id === entry.id);
    if (expense) openExpenseDialog(expense);
  };

  return (
    <Dialog className="day-ledger-dialog" open={open} onClose={closeDayLedger}>
      <div className="day-ledger-panel">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Day breakdown</p>
            <h2>{dayLedgerDate ? dayLabel(dayLedgerDate) : ""}</h2>
            <p>
              {`${totals.count} ${totals.count === 1 ? "entry" : "entries"} · net `}
              <strong className={totals.net < 0 ? "is-out" : "is-in"}>
                {(totals.net < 0 ? "−" : "+") + currency(Math.abs(totals.net))}
              </strong>
            </p>
          </div>
          <button className="icon-button" aria-label="Close" type="button" onClick={closeDayLedger}>
            ×
          </button>
        </div>

        <div className="day-ledger-summary">
          <article className="is-in">
            <span>Came in</span>
            <strong>{currency(totals.earned)}</strong>
          </article>
          <article className="is-out">
            <span>Went out</span>
            <strong>{currency(totals.spent)}</strong>
          </article>
        </div>

        <div className="day-ledger-list">
          {entries.length ? (
            entries.map((entry) => (
              <button
                key={entry.type + ":" + entry.id}
                className={"day-ledger-row " + (entry.type === "expense" ? "is-expense" : "is-earning")}
                type="button"
                onClick={() => openEntry(entry)}
              >
                <span className="day-ledger-ico" aria-hidden="true">
                  <Icon name={entry.type === "expense" ? "arrow_outward" : "south_west"} />
                </span>
                <span className="day-ledger-copy">
                  <strong>{entry.title}</strong>
                  <span>{entry.detail}</span>
                </span>
                <span className="day-ledger-amount-col">
                  <strong className="day-ledger-amount">
                    {(entry.type === "expense" ? "−" : "+") + currency(entry.amount)}
                  </strong>
                  {entry.mode ? (
                    <small className="day-ledger-mode">{domain.paymentModeLabel(entry.mode)}</small>
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <p className="history-empty">Nothing was recorded on this day.</p>
          )}
        </div>

        <div className="form-actions">
          <button className="secondary-action" type="button" onClick={closeDayLedger}>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
