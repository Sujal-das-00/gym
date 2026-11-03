# Phase 4: Activity history

Implementation notes · 2 Nov 2026 · status: **implemented on the working tree (uncommitted); `npm test` 93/93 (Phases 1–3: 75, Phase 4: 18)**

Builds on Phases 1–3 (committed up to `cb4cb49`). Baseline before Phase 4: 75/75.

---

## 1. Audit: what existed

| Activity | Existing record | Enough on its own? |
|---|---|---|
| Payment recorded / corrected / cancelled | `payment_transactions` (entered by, reversed by, reason, replaces / replaced by) and allocations | Yes for history. But "cleared old dues" and "renewal" are only known when the payment is taken. |
| Payment details edited | `payment_corrections` (one row per field, who, when) | Yes |
| Plan change, restart, waived or kept dues | `member_plan_changes` (snapshots, effective date, who, `dues_detail`) | Yes |
| Member added | `members.created_at` | **No: who added them isn't stored.** |
| Member edited (phone, address, joining date…) | Nothing; the row is overwritten | **No: no record at all.** |
| Member removed | `members.archived_at` | **No: who removed them isn't stored.** |

**Decision:** one new table, `activity_log`, which is the log itself. It is not a copy of payments:
- Each row points at its source record (`source_key`: `tx:<id>`, `plan:<id>`, `corr:<id>`, …).
- It stores only what is needed to show the activity.
- Income still comes only from `payment_transactions`; no money screen reads this table.
- Records from before Phase 4 are **backfilled once** from those same tables, so the history starts at the gym's first record, not at deployment.

## 2. Database

`activity_log` is in `schema.sql` (applied on boot) and in `migrations/008-activity-history.sql` (hand-run; re-runnable, checked twice).

| Column | Purpose |
|---|---|
| `id`, `seq` (auto-increment) | `seq` keeps the written order for activities logged in the same instant (a plan change logs the change, its waived dues and its payment together) |
| `tenant_id` | Gym isolation; every read is `WHERE tenant_id = ?` |
| `occurred_at` | ISO UTC time the action completed, like `members.created_at` |
| `action`, `categories` (SET) | What happened; which filters show it (a renewal payment is a Payment **and** a Membership activity) |
| `member_id`, `member_name`, `member_code` | The member, as a snapshot, so the row still reads right after renames and archiving |
| `actor_id/name/role` | Who did it (NULL = not recorded, only on backfilled rows) |
| `details` JSON | Old/new values, amounts, terms, effective and expiry dates |
| `source_key` | `UNIQUE (tenant_id, source_key)`: a record is never logged twice |
| `backfilled` | 1 = rebuilt from records made before the log existed |

No existing table or row changes. There is no delete path. Rows go only if the whole gym is deleted (`ON DELETE CASCADE`, as for every gym table).

## 3. When activities are written

- **In the same DB transaction as the action:**
  - recording, editing, correcting and reversing payments (inside `withMemberLock`);
  - plan changes and restarts.

  A refused or rolled-back action leaves no activity. A retried request (same `requestId`) adds none.
- **Right after the action succeeds:** adding a member, adding an existing member, profile edits and archiving. These actions were never a single DB transaction. If writing the activity fails, the action stays done and a warning is logged.

## 4. What is logged (spec §2 → actions)

| Spec | Action | Filters |
|---|---|---|
| New / existing member added (both dates for existing) | `member_added` | Members |
| Member details edited / phone changed (one activity **per field**, old → new) | `member_updated` | Members (admission fee: also Payments) |
| Member information corrected / membership end date changed | `joining_date_changed`, with the renewal date before and after | Members, Membership |
| Member status changed | `member_archived` (removed; kept on record) | Members |
| Payment recorded / used to clear old dues / membership renewed | `payment_recorded`: one per payment however many terms it covers. Each term is marked old due, current (renewal), in advance, opening balance or kept dues. | Payments, plus Membership (renewal), plus Balance (old dues) |
| Payment details edited | `payment_edited`, one per field | Payments |
| Wrong payment corrected / replacement recorded / moved to another term / historical payment corrected | `payment_corrected`: **one** activity holding both payments, flagged `moved` / `historical` | Payments (historical: also Balance) |
| Payment cancelled | `payment_cancelled` | Payments |
| Amount increased / decreased / changed / expired membership restarted / future change scheduled | `plan_changed`: previous and new amount, effective date, the old plan's last day, the new term's last day, `scheduled` | Membership |
| Outstanding dues waived (**not money received**) | `dues_waived` | Balance |
| Outstanding balance changed | `dues_kept` (old-plan dues kept as balance due) | Balance |
| Old balance added | `opening_balance_added` | Balance |
| Old payment records checked and confirmed | `history_confirmed` (each term paid or unpaid) | Balance |

## 5. API and admin UI

`GET /api/activities?from=&to=&category=&q=&before=&beforeSeq=`:
- Gym admin and staff, for their own gym only.
- Newest first, 100 at a time, with paging.
- Never public: the member app and kiosk have no route to it.

**Detail Insights → Activity** (third tab, `components/ActivityPanel.jsx`). It is laid out like the Money tab:
1. **Period:** the same Month / Year / Custom bar as Money and Plan changes. Custom with no dates means all records. The bar shows the count, and Export CSV exports the activities.
2. **Search:** a member's name or ID.
3. **Type:** All / Members / Payments / Membership / Balance changes.

**Day by day:** one card per day, newest first, with the date tile, weekday and a breakdown ("2 payments · 1 member update").

**Day window:** tapping a day opens it, like the Money day window. Each activity is **one card**:
- what happened;
- one line of what matters (old → new, terms paid, amounts and dates, reason);
- the time and who did it;
- the amount, for money activities (+ in, − cancelled; waived dues and old balances in plain colour, never as money in).

Tapping a card opens the member's profile. All wording is in `lib/activity.js` (`activityCard`).

## 6. Tests

`npm test`: **93/93**.

- `activity.unit.test.js` (6, no database):
  - Insights period → day range;
  - ₹2,000 → ₹4,000 and back, worded as the spec asks;
  - payment tags;
  - waivers marked as not income;
  - per-field edits; both dates for existing members;
  - day grouping.
- `activity.db.test.js` (12, throwaway MySQL database plus the HTTP routes), spec §7:
  - A1–A2: new and existing members;
  - A3: editing twice, field by field;
  - A4: several payments, a retried one, a refused one;
  - A5: edits, corrections and cancellations;
  - A6: renewals;
  - A7–A8: ₹2,000 ↔ ₹4,000;
  - A9: restart;
  - A10: waive (no transaction created);
  - A11: different dates, the Insights period, paging;
  - name search;
  - A12: gym isolation (service and HTTP; 401 without login);
  - the backfill rebuilds the live log from the records alone, and runs only once.
- Also checked:
  - the JSON fallback store (in-memory run);
  - `008` run twice on a throwaway database;
  - the admin build.

## 7. Known limits

- **Profile edits made before Phase 4** were never recorded, so they can't be backfilled.
- **Backfilled "member added"** knows who did it only when a joining or history payment recorded it.
- **Backfilled history confirmations** don't know the unpaid count.
- **Member add, edit and archive** are logged right after success, not atomically (§3). A database failure in that exact window would lose that one activity, never the action.
- **Membership statuses (Active/Expired) are computed, not actions,** so they aren't logged. "Member status changed" means removing a member.
- **Not logged:** clearing a deleted trainer from their members, attendance and check-ins, expenses and settings. These are outside the spec's list.
- **Not clicked through in a browser;** the build and the API are tested.

## 8. Follow-up changes (2 Nov 2026, requested after Phase 4)

### Record payment: Full or Partial again

The sheet opens with two choices, as before Phase 2:
- **Full payment:** tick the months being paid; every owed month starts ticked. Each ticked month is paid in full. The next term can be ticked to renew in advance.
- **Partial payment:** enter the amount. It clears the oldest month first, and the sheet shows the split before saving (for example, ₹1,500 of ₹2,000 → month 1 paid in full, ₹500 now and ₹500 still due on month 2).

Then the payment mode (with optional reference and note) and the date paid.

Underneath it is still the Phase 2 API: Full is a manual allocation, Partial is oldest first. Server rules, idempotency and the Correct payment sheet (which shares these fields) are unchanged.

### Part-paid months count as overdue

**Decided by the user.** A month with money still left on it is **Overdue** once it is past its due point, like an unpaid month. This replaces the earlier rule that it was only a blue "Balance due".

| | Before | Now |
|---|---|---|
| Overdue amount | One full fee per overdue month | What is left on each overdue month (₹500 here) |
| Expiry | Part-paid months never expired the membership | They do, like any overdue member. Check-in is refused only if the gym has turned off check-in for expired members. |
| "Balance due" | Every part-paid month | Only part-paid months not yet due, old-plan dues kept as balance, and opening balances |

**Also affected:**
- The WhatsApp reminder quotes the overdue amount.
- The member app's renewal card shows the overdue amount while overdue.
- This also applies to partly-paid past terms entered in Phase 1. Three earlier tests that asserted "not overdue" were updated.

### Existing members: a month is paid only when its fee was cleared

**Decided by the user; replaces Phase 1's Q1 default.** The "Paid in full" box was ticked by default and settled a month at whatever amount was typed. So ₹1,000 entered against a ₹2,000 month counted as paid.

The checkbox is gone. Each paid month now shows **Fee for this month**, pre-filled with the current plan fee:
- An amount below that fee leaves the rest due, shown as "₹1,000 still due for this month". Once the month is past due, it is overdue.
- Only when the month really cost less does the owner change its fee.

The server API is unchanged; the form now sends `paidInFull` from amount ≥ fee (`termSettlement` in `lib/onboarding.js`).

**Members saved before this fix keep their stored fee.** To fix one, open the payment in their history, choose *Correct*, and re-enter the same amount. The replacement is checked against the plan fee, so the shortfall becomes due. The original stays on record as corrected.

### No advance payments

**Decided by the user; replaces Phase 3's L3.** A month can only be paid once it has started:
- The server ignores `renewAhead`, so Phase 2's rule (only started terms are payable) applies again.
- Record payment, the Correct payment sheet and the member profile no longer offer renewing in advance.
- A scheduled plan change's first month can't be collected until it starts (400).
- Payments made ahead before this change still count, and the renewal date still reads through them.
