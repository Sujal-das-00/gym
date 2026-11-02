# Phase 2: Payment management and financial reconciliation

Technical implementation plan · drafted 2 Nov 2026 · revised 2 Nov 2026 · status: **decisions approved, audit complete, no code written**

Builds on Phase 1 (existing-member onboarding), implemented in the local working tree on `main` and not yet committed. Phase 1 baseline on 2 Nov 2026: `npm test` passes **25/25**. Those tests stay as Phase 2 regression tests.

---

## 1. Approved decisions

| # | Decision | What it means in the code |
|---|---|---|
| P1 | **A parent payment transaction sits above the existing billing/allocation rows.** One transaction can cover several terms and counts as **one** collection. | New `payment_transactions`. Existing `payments` rows become its allocations (`payments.transaction_id`). |
| P2 | **Existing payment rows become one transaction each**, with original amounts, dates, members and terms preserved. | Re-runnable backfill; nothing on an existing row changes except the new link (§3.1). |
| P3 | **Method, reference and notes are edited in place with an audit trail. Amount, collection date and allocation are corrected by reversal plus replacement, linked to the original. The reversal and replacement are atomic.** | `payment_corrections` log for in-place edits. One DB transaction does reverse + replace + link. |
| P4 | **Payments above the outstanding amount are rejected.** No wallet credit or advance balance. | 400 with the amount owed in the message. |
| P5 | **Only gym owners/admins can correct or reverse. Staff can still record. Enforced on the backend.** | `requireRole("gym_admin", "super_admin")` on the correct and reverse routes. The UI hides the actions for staff. |
| P6 | **Reversals are blocked for payments on historical terms closed by a plan change or an opening-balance cut-over**, with a clear explanation. The historical debt is preserved, never silently lost. | 409 if any allocation's term starts before the member's current billing start (`billingStartKey`). |
| P7 | **A payment toward an opening balance needs a known collection date**, defaulting to today, and any other known date can be chosen. | 400 if `date` is null and the allocation includes the opening balance. |
| P8 | **Record Payment defaults to the oldest debt first: the opening balance, then the oldest outstanding terms.** Manual allocation stays available for eligible terms. | FIFO is the default mode. "Choose terms" lists the same eligible terms. |
| P9 | **No advance or future-term payments in Phase 2.** Current rules are kept. | Eligible terms = today's payable terms (started terms; ended terms for pay-after-term members) plus the opening balance. |
| P10 | **Admission fee payments are unchanged and managed through the member profile.** Recorded admission amounts and dates are protected from accidental modification. | Admission rows have no transaction and can't be recorded, allocated, corrected or reversed by Phase 2 operations. Profile saves that don't change the admission fee leave the row untouched (§2, A2). |

### 1.1 Additional requirements → how they're met

| Requirement | Guarantee |
|---|---|
| Transactions and allocations stay separate | `payment_transactions` (money received) vs `payments` (money applied to a term). Allocations always reference their transaction. |
| Insights count each collection once | The ledger makes one earning per active transaction (split only by term month when the date is unknown). Allocations never become separate earnings. |
| Reversals restore outstanding balances | Reversed allocations are excluded when members load, so every balance and overdue rule recomputes from the remaining rows. |
| Every financial operation is auditable | Each transaction records who entered it and when. Corrections are logged per field (old → new, who, when). Reversals store who, when and why. Replacements are linked both ways. Nothing is deleted. |
| No duplicate submissions or concurrent over-allocation | A per-sheet `request_id` is unique per gym, so a retry returns the first result. The member row is locked (`SELECT … FOR UPDATE`) while balances are read and allocations written. |
| Compatible with Phase 1 and existing records | Phase 1's 25 tests are re-run. The backfill is checked field by field. The old request body is still accepted. |

## 2. Audit (complete)

| Area | Finding | Phase 2 handling |
|---|---|---|
| Payment table | `payments(id, member_id, payment_date, month_key, billing_month, billing_period, amount DECIMAL(10,2), period_fee, kind, payment_mode, date_known, created_at)`. One row = money applied to one term. No parent transaction, reference, note, status or "entered by". | Becomes the allocation table (§3.1). |
| Who reads payment rows | **Only member loading** (`memberModel.hydrateMembers`, `SELECT * FROM payments`) and the admission sync. No report or super-admin query reads payments directly. | Filtering reversed rows at hydration covers billing, overdue, outstanding, reminders, plan changes, Insights and the member app in one place. |
| Writers of payment rows | Desk collection (`addPayments`), new member first term (`createMember`), plan change (`applyPlanChange`), Phase 1 history (`createMemberWithHistory`), admission sync, legacy import. | Every membership writer also creates its transaction. Admission is excluded (P10). |
| Billing terms | Computed by `getBillingPeriodKeys` from `billingStartKey`. A term is `(member_id, billing_period)`. | Allocations reference that pair. No terms table. |
| Term status | `getPeriodLedger`: settled when the rows reach `period_fee`. Part-paid = "Balance due", not overdue. | Unchanged. Paid / Partially paid / Unpaid read from it. |
| Recording | `POST /members/:id/payments` → `preparePeriodPayments` → `addPayments`: row by row, **no DB transaction, no lock**. | §3.2. |
| Default selection | The Collect sheet pre-ticks the **current** term plus part-paid balances, so older overdue terms are skipped by default. | FIFO default (P8). |
| Allocation helper | `allocatePayment(dues, amount)` already spreads oldest first. | Reused for the FIFO preview. The server re-allocates authoritatively. |
| Collection date | The desk always sends today. | "Paid on" + "Don't know" (except for the opening balance, P7). |
| Corrections / reversals / refunds | **None exist.** There is no update or delete route for payments. | New (§3.4, §3.5). |
| Duplicate-key errors | Any `ER_DUP_ENTRY` is reported as "Member with this Gym ID or phone already exists". | Duplicate `request_id` returns the original. The error handler distinguishes payment duplicates. |
| Admission rows (A2) | `syncAdmissionPayment` **deletes and re-inserts** the admission row on every profile save of a new member, giving it a new id each time and re-dating it to the joining date. Phase 1 already made existing members' rows update in place. | Update in place for every member when the amount or mode really changes, and leave the row untouched otherwise. A new member's admission date still follows a *changed* joining date (today's rule for "collected at joining"). |
| Insights | `ledger.js`: one earning per payment row, dated `payment.date`. `PaymentsView` counts rows as payments. | One earning per transaction (§3.3). |
| Member app | One receipt per payment row. The native PDF (`mobile-app/*/lib/receipt_pdf.dart`) mirrors `receiptData()`. | One receipt per transaction. `receiptData` keeps its fields. Reversed payments are never shown. |
| Money arithmetic | DECIMAL(10,2) in the DB; mysql2 returns strings; JS `Number` with `Math.round(x*100)/100`. | Server validation and allocation in integer paise (`utils/money.js`). |
| Permissions | `req.user = { id, role, name, email, tenantId }`. Payment routes allow `gym_admin` and `staff`. | P5 routes add `requireRole("gym_admin", "super_admin")`. |
| Gym isolation | Payments have no `tenant_id`; isolation is by loading the member as `(tenant_id, id)`. | `payment_transactions.tenant_id`; every transaction lookup is `(tenant_id, member_id, id)`. |

## 3. Design

### 3.1 Data model (adds only)

**New `payment_transactions`** (money received):

| Column | Notes |
|---|---|
| `id` CHAR(36) PK | |
| `tenant_id` CHAR(36), `member_id` CHAR(36) | FK; every query filters by both |
| `amount` DECIMAL(10,2) | Total received = Σ its allocations (no unallocated money, P4) |
| `collected_on` DATE | Real date; or the stand-in when `date_known = 0` (a single-term transaction's term start) |
| `date_known` TINYINT(1) | Phase 1 rule |
| `payment_mode` ENUM (as payments), `reference` VARCHAR(80), `note` VARCHAR(300) | Editable in place, with a logged audit trail (P3) |
| `request_id` CHAR(36) NULL | `UNIQUE (tenant_id, request_id)` |
| `source` ENUM('desk','join','plan_change','onboarding','correction','legacy') | Where it came from |
| `status` ENUM('active','reversed') | |
| `reversed_at`, `reversed_by_id`, `reversed_by_name`, `reversal_reason` | Set once |
| `replaces_id`, `replaced_by_id` | Correction links |
| `entered_by_id`, `entered_by_name`, `entered_by_role`, `created_at` | Data entry; never the collection date. NULL for the legacy backfill ("not recorded") |

**`payments` (existing) = allocations:** add `transaction_id CHAR(36) NULL` (FK) and `reversed_at DATETIME NULL`.

**New `payment_corrections`:** `id, tenant_id, transaction_id, field ('mode'|'reference'|'note'), old_value, new_value, changed_by_id/name/role, changed_at`.

**Migration `006-payment-transactions.sql`** (+ boot migration + `schema.sql`):
1. Add the tables and columns.
2. Backfill one `source='legacy'` transaction per membership row with `transaction_id IS NULL`, copying amount, `payment_date`, `date_known`, mode and `created_at`.
3. Link them.

Admission rows are not linked. The migration is re-runnable, and is reversed by dropping the new tables and the two columns.

### 3.2 Recording: `POST /members/:id/payments` (extended; old body still accepted)

```jsonc
{
  "requestId": "uuid made when the sheet opened",
  "amount": 2000,
  "date": "2026-11-02",                 // null = date not recorded (not allowed with the opening balance)
  "mode": "upi", "reference": "UPI 4471", "note": "",
  "allocation": "fifo",                 // or "manual"
  "allocations": [ { "billingPeriod": "2026-10-01", "amount": 1000 } ]   // manual only
}
```

In one DB transaction:
1. Lock the member row.
2. A known `requestId` returns the stored transaction (200, no new rows).
3. Eligible debts: the opening balance due, then payable unpaid or part-paid terms, oldest first.
4. Allocate:
   - **FIFO:** oldest first until the amount is used.
   - **Manual:** each line ≤ that term's balance, no duplicates, and the lines sum exactly to `amount`.
5. Reject (400):
   - an amount ≤ 0, or above the eligible total (P4)
   - an ineligible term (P9)
   - a future date, or a date before joining
   - an unknown date with the opening balance (P7)
6. Insert the transaction and allocations (with `period_fee` stamped as today), then commit.

All the arithmetic is done in integer paise. The response is the member plus the new transaction. The old `{ payments: [...] }` body is converted to a manual allocation dated today.

### 3.3 Billing and Insights

- **Hydration:** `member.payments` = allocations of active transactions (plus admission rows). `member.transactions` = transaction summaries, including reversed ones (for the admin history). The billing code is unchanged.
- **`ledger.js`:** one earning per active transaction, on `collected_on`, with its terms in the detail.
  - An unknown-date transaction is split into one entry per allocation, each on that term's start and labelled "Date not recorded".
  - Admission rows stay one entry each.
  - `PaymentsView` and the Dashboard count transactions.
- The opening balance is never income. Money collected against it is (P7: always dated).

### 3.4 Corrections (P3, P5)

- `PATCH /members/:id/payments/:txId` with `{ mode?, reference?, note? }` (admin only): updates in place and writes one `payment_corrections` row per changed field. 400 if nothing changed. Not allowed on a reversed transaction.
- `POST /members/:id/payments/:txId/correct` with `{ reason, amount, date, allocation, allocations, mode, reference, note }` (admin only). In **one DB transaction**:
  1. Lock the member.
  2. Reverse the original (reason "Corrected: <reason>").
  3. Re-read the balances without it.
  4. Allocate and insert the replacement (`source='correction'`, `replaces_id`).
  5. Set the original's `replaced_by_id`.
  6. Commit.

  If anything fails, nothing changes. A replaced transaction can't be corrected again (correct its replacement instead). P6 applies to the original.

### 3.5 Reversals (P5, P6)

`POST /members/:id/payments/:txId/reverse` with `{ reason }` (required, 3–300 characters; admin only). Sets `status='reversed'` with who, when and why, and stamps its allocations' `reversed_at`, in one DB transaction.
- 409 if it's already reversed, which prevents duplicate reversals.
- 409 if any allocation's term starts before `billingStartKey(member)`. The message: *"This payment is for terms closed by a plan change on 1 Oct 2026 (or the opening balance from 2 Nov 2026). Reversing it would drop that debt from billing, so it can't be reversed here."*
- 404 for an admission row, or another gym's transaction.
- Nothing is deleted.

### 3.6 Admin UI

**Collect sheet → "Record payment":**
1. **Amount** (pre-filled with the total owed).
2. **Paid on**: today by default, or another date; "Don't know" is hidden when the opening balance is involved.
3. **Method**, plus optional **Reference** and **Note**.
4. **Allocation**:
   - **Oldest debt first** (default): shows the split line by line.
   - **Choose terms**: eligible terms with their due amount and an editable amount, plus an "Unallocated ₹X" line that must be ₹0 to confirm.
5. **Summary** → **Record ₹X**. A double tap or a retry reuses the sheet's `requestId`.

**History** (member sheet and Record payment sheet): one row per transaction, with its terms. Admins see a **⋯** menu with *Edit details* (method, reference, note), *Correct amount / date / terms* and *Reverse*. Reversed rows are struck through, with the reason, who and when. A corrected row links to its replacement.

### 3.7 Member app

One receipt per active transaction, listing its terms. Reversed and replaced transactions are never shown (members only see paid invoices). `receiptData()` keeps its field names; `paidFor` lists the terms.

## 4. Acceptance tests

Billing/UI rules run through both billing copies on a fixed clock (2 Nov 2026, 30-day cycle). Integration tests run on a throwaway MySQL database (skipped without `DB_*`). Monthly ₹1,000 member, upfront, joined 2 Aug 2026 (terms 2 Aug, 1 Sep, 1 Oct, 31 Oct) unless stated.

| # | Scenario | Expected |
|---|---|---|
| T1 | Full payment, one term (₹1,000 → 31 Oct, manual) | 1 transaction, 1 allocation; 31 Oct Paid |
| T2 | One payment, several terms: ₹3,000 FIFO, all four unpaid | 1 transaction; 3 allocations (2 Aug, 1 Sep, 1 Oct); 31 Oct Unpaid; **Insights shows one ₹3,000 earning**; PaymentsView "1 payment" |
| T3 | Two payments settle one term (₹600 + ₹400 → 2 Aug) | 2 transactions; 2 Aug Paid after the second |
| T4 | Partial: ₹600 → 2 Aug | Partially paid, ₹400 balance, not overdue for that term |
| T5 | FIFO across Phase 1 history: existing member with 2 Aug paid, 1 Sep and 1 Oct unpaid; ₹1,500 | 1 Sep ₹1,000 Paid, 1 Oct ₹500 part-paid |
| T5b | FIFO with an opening balance: ₹3,000 balance, ₹2,000 | ₹2,000 to the opening balance (P8); ₹1,000 still owed; no term touched |
| T6 | Manual to a newer term: ₹1,000 → 1 Oct while 2 Aug and 1 Sep are unpaid | 1 Oct Paid; 2 Aug and 1 Sep stay overdue (manual never replaced by FIFO) |
| T6b | Manual line above the term balance, duplicate line, ineligible/future term, or unallocated remainder | 400 each, nothing written |
| T7 | Overpayment: ₹5,000 when ₹4,000 is owed | 400 "₹4,000 is owed" (P4) |
| T7b | ₹0, negative, non-numeric, more than 2 decimals | 400 |
| T7c | Future date; date before joining; invalid date | 400 |
| T8 | Edit details: mode cash → upi, add a reference | Transaction updated; 2 `payment_corrections` rows (old → new, who); amounts and allocations unchanged; staff → 403 |
| T8b | Correct amount: ₹1,000 → ₹800 on 2 Aug | Original reversed (kept, `replaced_by_id`); replacement ₹800 (`replaces_id`); 2 Aug part-paid ₹200; income −₹200 net; **atomic**: a failing replacement leaves the original active |
| T8c | Correct date: 2 Oct → 28 Sep | October income −₹1,000, September +₹1,000; one active transaction |
| T8d | Correct allocation: 1 Oct → 31 Oct | 1 Oct unpaid again, 31 Oct paid; total income unchanged |
| T9 | Reverse ₹2,000 (2 Aug + 1 Sep) with a reason | Status reversed with who, when, why; both terms unpaid again; outstanding +₹2,000; allocation rows kept, `reversed_at` set |
| T9b | Reverse again / missing reason / staff / other gym | 409 / 400 / 403 / 404 |
| T9c | P6: a member whose plan changed on 1 Oct; reverse the payment that settled 1 Sep at the change | 409 with the explanation; payment still active; debt not lost |
| T9d | P6: a payment toward an opening balance | Reversible; the opening balance due returns to its amount |
| T10 | Opening balance settled in two payments (₹1,000 + ₹2,000) | Due ₹2,000 → ₹0; third payment → 400; opening balance never income at registration |
| T10b | P7: opening-balance payment with an unknown date | 400; with today's or another known date → accepted |
| T11 | Unknown date, one payment of ₹2,000 FIFO over 2 Aug + 1 Sep | Insights: ₹1,000 in Aug + ₹1,000 in Sep, both "Date not recorded"; **₹0 in November** |
| T12 | Same `requestId` sent twice | 1 transaction; the second response returns the first |
| T12b | Two different requests in parallel for the last ₹1,000 owed | Exactly one succeeds, the other 400; never over-allocated |
| T13 | Monthly Insights after record → correct → reverse | Each month equals Σ active transactions dated in it; reversed and replaced never counted; correction counted once |
| T14 | Reversed payments in every view | Excluded from Dashboard, Insights, PaymentsView totals, outstanding and member-app receipts; shown struck through in the admin history |
| T15 | Gym isolation | Recording, editing, correcting or reversing another gym's member or transaction → 404 |
| T16 | Migration | Every existing membership row gets exactly one legacy transaction (same amount, date, `date_known`, mode, `created_at`); admission rows unlinked; every member's dues, overdue and outstanding identical before and after; re-running adds nothing |
| T17 | Old request body `{ payments: [...] }` | Still works; creates one transaction |
| T18 | P10: profile save without an admission change; with a changed amount | Admission row untouched (same id, date); amount changed in place, date kept; no Phase 2 route can touch it (404) |
| T19 | Other writers | New member at-join, plan-change dues/first term and Phase 1 onboarding each create transactions (`source` set); Phase 1's 25 tests still pass |

## 5. Backward compatibility

- Existing rows keep their amounts, dates, members and terms (T16). Backfill only adds parents and links, and is reversible.
- Until something is reversed, every existing read gives identical results.
- Old admin builds keep working through the old body (T17). Old member-app builds read the same payment fields.
- Mobile apps' PDF receipt: same `receiptData` fields.
- Deploy: backend first (migration on boot), then the admin and member-app builds.

## 6. Files expected to change

Backend: `schema.sql`, `migrations/006-payment-transactions.sql` (new), `services/migrationService.js`, `models/paymentModel.js`, `models/memberModel.js`, `models/fallbackModel.js`, `services/paymentService.js`, `services/memberService.js`, `services/onboardingService.js`, `services/planChangeService.js`, `controllers/memberController.js`, `routes/apiRoutes.js`, `middleware/errorHandler.js`, `utils/billing.js`, `utils/money.js` (new), `test/payments.*.test.js` (new).

Admin: `dialogs/FeeDialog.jsx`, `components/PaymentHistoryItem.jsx`, `dialogs/PaymentActionDialog.jsx` (new), `lib/billing.js`, `lib/ledger.js`, `lib/payments.js` (new, pure allocation/preview rules), `views/PaymentsView.jsx`, `lib/dashboard.js`, `store/AppProvider.jsx`, `style.css`.

Member app: `components/InvoicesCard.jsx`, `views/MemberReceipts.jsx`, `lib/receipt.js`.

## 7. Points decided while writing this up (flag if you disagree)

- **A2. Admission sync** stops deleting and re-inserting the row on every profile save (P10, "protect from accidental modification"). A new member's admission date still follows a *changed* joining date, which is today's rule because it's collected at joining. Say if you want it frozen once recorded, as for existing members.
- **The stand-in date of a multi-term unknown-date transaction:** `collected_on` holds the earliest term's start for sorting. Insights always splits it per term (T11).
- **Super admin** acting on a gym counts as an owner for P5, as elsewhere in the admin API.
