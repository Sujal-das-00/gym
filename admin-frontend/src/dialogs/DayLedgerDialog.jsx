import { useMemo } from "react";
import { useApp } from "../store/AppContext.jsx";
import Dialog from "../components/Dialog.jsx";
import { currency } from "../lib/dates.js";
import { CATEGORY_ICONS } from "../lib/constants.js";
import { getLedgerEntries, filterEntriesByDate, summarizeEntries } from "../lib/ledger.js";
import { dayLabel } from "../lib/period.js";
import Icon from "../components/Icon.jsx";

/**
 * The window behind a day row on the Insights screen: every single earning and
 * expense recorded on that one date, named and signed, so the admin can see
 * exactly what made up the day's total.
 */
export default function DayLedgerDialog() {
  const { dayLedgerDate, closeDayLedger, members, expenses, domain, openDetail, openExpenseDialog } = useApp();
  const open = Boolean(dayLedgerDate);

  const entries = useMemo(() => {
    if (!dayLedgerDate) return [];
    return filterEntriesByDate(getLedgerEntries({ members, expenses, domain }), dayLedgerDate, dayLedgerDate);
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
    <Dialog className="sheet" open={open} onClose={closeDayLedger}>
      {open ? (
        <div className="sheet-panel">
          <header className="sheet-head">
            <span className="sheet-grabber" aria-hidden="true" />
            <h2>{dayLabel(dayLedgerDate)}</h2>
            <button className="sheet-close" aria-label="Close" type="button" onClick={closeDayLedger}>
              <Icon name="close" />
            </button>
          </header>

          <div className="sheet-body">
            <div className="money-card-split">
              <div className="is-in">
                <span className="money-card-ico" aria-hidden="true">
                  <Icon name="south_west" />
                </span>
                <div>
                  <small>Came in</small>
                  <b>{currency(totals.earned)}</b>
                </div>
              </div>
              <div className="is-out">
                <span className="money-card-ico" aria-hidden="true">
                  <Icon name="north_east" />
                </span>
                <div>
                  <small>Went out</small>
                  <b>{currency(totals.spent)}</b>
                </div>
              </div>
            </div>

            <section className="contact-group">
              <h3 className="contact-group-title ledger-day-title">
                {totals.count} {totals.count === 1 ? "entry" : "entries"}
                <em className={totals.net < 0 ? "is-out" : "is-in"}>
                  Net {(totals.net < 0 ? "−" : "+") + currency(Math.abs(totals.net))}
                </em>
              </h3>
              {entries.length ? (
                <ul className="contact-list">
                  {entries.map((entry) => (
                    <li key={entry.type + ":" + entry.id}>
                      <button
                        type="button"
                        className={"contact-row no-dot ledger-entry " + (entry.type === "expense" ? "is-out" : "is-in")}
                        onClick={() => openEntry(entry)}
                      >
                        <span className="ledger-tile" aria-hidden="true">
                          <Icon name={CATEGORY_ICONS[entry.category] || "receipt_long"} />
                        </span>
                        <span className="contact-copy">
                          <strong>
                            <span className="contact-name">{entry.title}</span>
                          </strong>
                          <small>{[entry.detail, domain.paymentModeLabel(entry.mode)].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="contact-state">
                          <strong className="ledger-amount">
                            {(entry.type === "expense" ? "−" : "+") + currency(entry.amount)}
                          </strong>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="member-empty">Nothing was recorded on this day.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
