# Phase 1: Existing member onboarding and historical payment reconciliation

Technical implementation plan · drafted 2 Nov 2026 · revised 2 Nov 2026 · status: **implemented locally (uncommitted), 25/25 tests passing**

Builds on `main` at `c7b62d9` (the joining-date re-key fix and the "Package ends on" wording, already on `main`). Phase 1 is built on a new branch from there.

---

## 1. Approved decisions

### 1.1 Core decisions

| # | Decision | What it means in the code |
|---|---|---|
| D1 | **Unknown collection date: count it in the billing term's month, labelled "Date not recorded".** Never use the data-entry date as the collection date. | The payment stores the **term's start date** as `payment_date` and `date_known = 0`, for both pay-before-term and pay-after-term members. Every screen, receipt and export shows "Date not recorded" instead of that date. `created_at` keeps the data-entry time separately. |
| D2 | **An unpaid opening balance is a separate balance due.** It never makes the membership overdue and never blocks check-in. Membership validity and the money owed stay separate. | The opening balance is added to *outstanding* amounts only. It is never part of `dueUnpaidPeriods` / `isMembershipExpired`. |
| D3 | **Admission fee is off by default for existing members.** There is an optional "Admission fee was paid" entry, with a known or unknown date. | Uses the existing `kind='admission'` row with `date_known`. |
| D4 | **Automatic daily push fee reminders are held for 3 days after an existing member is registered.** They then resume only if dues remain. | Only the scheduled run, and only for `onboarding_type = 'existing'` members with `created_at` less than 3 days ago. Members already in the system, manual sends and WhatsApp are unaffected. |
| D5 | **One reconciliation method per member:** term by term **or** an opening balance, never both. | The API rejects a request that sends both. |
| D6 | **Order of work:** the joining-date fix and package wording ship first. | Done. Both are on `main` in `c7b62d9`. |

### 1.2 Answers to the open questions

| # | Decision | What it means in the code |
|---|---|---|
| Q1 | **"Paid in full" is ticked by default.** Ticked: the term is settled at the amount actually collected, even if that is below today's fee. Unticked: the remaining balance = the term's fee − the amount collected. The collected amount is **never** increased. | Ticked: `amount = period_fee = amount entered`, so the term is settled. Unticked: a **"Fee for this term"** field appears, pre-filled with the current plan fee and labelled *"Using current plan fee ₹1,000"*. `period_fee` = that fee, `amount` = the amount collected, and the term shows a balance. See §8, A1. |
| Q2 | **An unknown date counts at the term's start date** for monthly Insights, for both collection timings. It is labelled "Date not recorded". | As D1. |
| Q3 | **Joining dates are allowed up to 24 months before registration.** An informational warning appears when more than 12 terms have passed. Reconciliation is never blocked inside the limit. Terms come from the existing billing engine. | Server: reject `startDate < registration − 24 months` (400). Client: a non-blocking warning above 12 terms. Terms come from `getBillingPeriodKeys` (no new term logic). |
| Q4 | **An unpaid admission fee can be included in an opening balance**, with an optional breakdown into membership dues vs admission fee. No separate admission charge or payment row is ever created for an unpaid amount. | `members.opening_balance` (total) plus `members.opening_balance_admission` (the optional admission part, ≤ total). This is display only; no rows are created. |

### 1.3 Additional confirmations

| # | Confirmation | How the plan guarantees it |
|---|---|---|
| C1 | **Terms are the gym's real membership terms (30-day terms for this gym), not calendar months.** | Terms come only from `getBillingPeriodKeys`, i.e. the gym's own `billingCycleMode`. On the default 30-day cycle, a member who joined on 2 Aug has terms starting 2 Aug, 1 Sep, 1 Oct and 31 Oct. *A gym set to "month start" in Settings bills by calendar month today, and still will; packages use their N-month terms. Phase 1 never overrides a gym's cycle setting.* |
| C2 | **The 3-day hold applies only to automatic daily push notifications for newly migrated existing members.** | See D4. The manual "send reminders" button is not held. |
| C3 | **Manual WhatsApp reminders are always available immediately.** | No change to `sendFeeReminder` (wa.me link). The Remind button is shown whenever dues exist. |
| C4 | **An existing member's recorded admission collection date is never overwritten by an ordinary profile edit.** | `syncAdmissionPayment` keeps the existing row's `payment_date`, `date_known` and mode for `onboarding_type = 'existing'`. Only an amount change touches the row, and even then the date is kept. |
| C5 | **The opening balance covers every term started by the migration date, including the current one. Normal billing resumes from the next term.** | `billing_cutover` = the start of the first term beginning **after** the registration date, on the joining-date grid. |
| C6 | **Opening balances never create duplicate billing periods or artificial income.** | No payment rows are created at registration. The opening balance is a member field. Income appears only when money is later collected against it (dated that day). Terms before the cut-over are never generated as billable, so they can't be billed twice. |

## 2. Audit: what already exists

| Spec requirement | Current implementation | Change needed |
|---|---|---|
| Original joining date vs GymBoo registration | `members.start_date` (DATE) is the joining date. `members.created_at` (ISO string, set on insert) is the registration time. | None. Already separate. |
| Collection date vs billing period | `payments.payment_date` is when the money was received. `payments.billing_period` is the term it pays. `payments.created_at` is when it was entered. | Only a flag for **unknown** dates (`date_known`). |
| Paying part of a term | `payments.period_fee`. A term is settled when its rows add up to the fee. A part-paid term is a "Balance due", not overdue. | None. Reused for Q1 (unticked). |
| Term generation | `getBillingPeriodKeys`, counted from `billingStartKey(member)` = `planStartDate \|\| startDate`. It is duplicated in `backend/src/utils/billing.js` and `admin-frontend/src/lib/billing.js`, which must stay in sync. | `billingStartKey` gains the opening-balance cut-over (§4.3). |
| Overdue | `dueUnpaidPeriods` / `getDueUnpaidPeriods`. At-join: overdue the day after an unpaid term starts. Fixed-day: overdue the day after it ends. This drives the check-in gate, badges, the member app home screen and reminders. | None to the rules. |
| Monthly income (Insights, Dashboard, day ledger) | `admin-frontend/src/lib/ledger.js` groups every payment by `payment.date`. **`toDateKey()` turns an empty date into today**, so a NULL date would inflate the current month. | Unknown dates are stored as the term start (D1), never NULL. |
| Add member | `memberService.createMember` runs `saveMember`, then `syncAdmissionPayment`, then for at-join it **automatically marks the first term paid**. These are three separate writes, not one transaction. | The existing-member path uses one new transactional model call. The new-member path is untouched. |
| Duplicate members | A unique phone / gym code per gym (DB key + `assertUniqueMember` returns 409). | Reused. The whole create transaction rolls back on a duplicate. |
| Fee reminders | Automatic: `autoNotificationService` → `sendFeeReminders` (push only). Manual: the admin "send reminders" button (same function), and WhatsApp `sendFeeReminder` (a wa.me link the admin taps). | A `scheduled` flag for the D4 hold. |
| Schema changes | Applied on every boot by `migrationService.ensureFeatureColumns` (column-exists checks), plus a hand-run copy in `backend/migrations/NNN-*.sql`. | Follow the same pattern (`005-existing-member-onboarding.sql`). |
| Tests | **No test runner or tests in the repo.** `npm run check` is syntax only. | Add `node:test` (built in, no new dependency) and `npm test`. |

## 3. Resolved conflicts (all approved)

1. **Terms are not calendar months** (C1). The reconciliation screen lists the gym's real terms, labelled by date range ("2 Aug – 31 Aug").
2. **Today's add-member flow assumes the first term is paid** (at-join). This stays for **New member** only. Existing members confirm every term explicitly, with no default.
3. **Admission rows are re-dated to the joining date on every member save** today. For existing members the recorded date is kept (C4).
4. **There are no automated WhatsApp reminders.** The D4 hold applies to the scheduled push fee reminder. Manual sends (button and WhatsApp) are immediate (C2, C3). The "renews in 3 days" push is not a dues reminder and is unchanged.
5. **The opening balance covers the current term too** (C5), so the owed amount equals exactly what the owner entered.

## 4. Design

### 4.1 Database (only adds things; no existing row changes meaning)

| Table.column | Type / default | Purpose |
|---|---|---|
| `members.onboarding_type` | `ENUM('new','existing') NOT NULL DEFAULT 'new'` | Marks members entered with history. Every current member becomes `'new'`, so their behaviour is unchanged. This is also the hook for the Phase 2 activity log. |
| `members.opening_balance` | `DECIMAL(10,2) NOT NULL DEFAULT 0` | Opening balance owed at registration (method B). |
| `members.opening_balance_admission` | `DECIMAL(10,2) NOT NULL DEFAULT 0` | Optional part of the opening balance that is an unpaid admission fee (Q4). Display only; always ≤ `opening_balance`. |
| `members.billing_cutover` | `DATE NULL DEFAULT NULL` | Method B only: the first term billed normally (C5). |
| `payments.date_known` | `TINYINT(1) NOT NULL DEFAULT 1` | `0` = collection date not recorded. `payment_date` then holds the term start (D1/Q2), or the joining date for an admission row. Existing rows are `1`. |

Payments toward the opening balance are ordinary `kind='membership'` rows with `billing_period = 'opening-balance'`, dated when they are actually collected. This mirrors how the admission fee uses the `'admission'` literal. No new ENUM value is needed, so old code reading `kind` is unaffected.

Migration `005-existing-member-onboarding.sql` (re-runnable, add-if-missing) plus the same in `ensureFeatureColumns` and `schema.sql`. To reverse it: drop the five columns. Nothing else depends on them, and no existing row is modified.

### 4.2 API: `POST /api/members` (backward compatible)

The body is unchanged for new members. An existing member adds:

```jsonc
"onboarding": {
  "type": "existing",
  "method": "periods",              // or "opening"
  "periods": [                      // method "periods": every started term exactly once
    { "period": "2026-08-02", "status": "paid", "amount": 1000, "paidInFull": true, "date": "2026-08-02", "mode": "cash" },
    { "period": "2026-09-01", "status": "paid", "amount": 800,  "paidInFull": true, "date": null, "mode": "" },  // settled at ₹800, date not recorded
    { "period": "2026-10-01", "status": "paid", "amount": 500,  "paidInFull": false, "termFee": 1000, "date": "2026-10-03", "mode": "upi" }, // ₹500 balance
    { "period": "2026-10-31", "status": "unpaid" }
  ],
  "openingBalance": 3000,           // method "opening" only
  "openingBalanceAdmission": 500,   // optional part of openingBalance (Q4)
  "admission": { "paid": true, "date": null, "mode": "cash" }   // optional (D3); amount = admissionFee
}
```

Server checks (`backend/src/services/onboardingService.js`, new):
- The joining date is before today (otherwise it's a new member) and **no more than 24 months before registration** (Q3). Otherwise 400.
- Rebuilds the member's terms with `getBillingPeriodKeys` from the joining date up to today. **Every started term must appear exactly once**, with no unknown, future or duplicate terms. Otherwise 400.
- A paid term needs `amount > 0`.
  - `paidInFull: true`: `period_fee = amount`, so the term is settled.
  - `paidInFull: false`: `termFee` is required (default: the current plan fee), `amount < termFee`, and `period_fee = termFee`.
  - The amount is stored exactly as entered.
- `date` must satisfy joining date ≤ date ≤ today, or be `null` → stored as the term start with `date_known = 0`.
- Method B: `openingBalance > 0`, `0 ≤ openingBalanceAdmission ≤ openingBalance`, `billing_cutover` computed by the server (C5), and **no payment rows**.
- `periods` and `openingBalance` together → 400 (D5).
- Writes the member, an optional admission row and all term payments in **one transaction**: new `repo().createMemberWithHistory()` (MySQL + JSON fallback). A double-submit hits the unique phone key, the whole thing rolls back, and no duplicate payments are created.

The response is the saved member (as today) plus `warnings: ["14 terms have passed since joining"]` when more than 12 terms have passed. `publicMember` adds `onboardingType`, `openingBalance`, `openingBalanceAdmission`, `billingCutover`. Payment rows add `dateKnown`.

### 4.3 Billing math (both copies, kept in sync)

- `billingStartKey(member) = planStartDate || billingCutover || startDate`. With method B, billing starts at the cut-over, which is on the joining-date grid, so the schedule continues unchanged after it.
- `memberBillingSummary` (member app) and `isPaidThisPeriod` / `isPlanChangeAhead` (admin) currently special-case only a future `planStartDate`. They are generalised to "billing starts later", so a method-B member reads as paid until the cut-over.
- New `openingBalanceDue(member)` = `opening_balance − Σ amount of 'opening' rows`, never below 0. It is added to `memberOutstanding` / `getOutstandingAmount` and to reminder eligibility, **but not** to `dueUnpaidPeriods`, `isMembershipExpired` or the overdue fee status (D2). While it is above 0 the status is "Balance due" (unless a term is also overdue, which takes precedence as today).
- `getPeriodLedger` skips `'opening-balance'` rows explicitly (the same treatment as admission), so they can never mark a term paid.
- `paymentService.preparePeriodPayments` accepts `billingPeriod: 'opening-balance'`, with `openingBalanceDue` as its charge (no overpaying, 409 once cleared).
- **Unpaid historical terms are owed at the current plan fee**, exactly as unpaid terms are today (outstanding = unpaid terms × fee). The reconciliation screen shows "Owed at current plan fee ₹1,000". If a different amount is really owed, the owner uses the opening-balance method. See §8, A2.
- **No change** to the overdue rules, term generation, grace day, part payments or plan-change rules.

### 4.4 Fee reminder hold (D4, C2, C3)

`sendFeeReminders(gymId, { scheduled = false })`: only the daily scheduled caller in `autoNotificationService` passes `scheduled: true`. In that mode, members with `onboardingType === 'existing'` and `createdAt` less than 3 × 24 h ago are skipped. After that they are included only if `outstanding > 0`, as normal. The manual admin button (`scheduled = false`), WhatsApp reminders and every `'new'` member take exactly the current path.

### 4.5 Admin frontend

1. **Add member** opens a small chooser: **New member** ("joining now") / **Existing member** ("already a member before GymBoo"). New member opens today's form, unchanged.
2. **Existing member** opens the same form fields (labelled "Original joining date"), then:
   - **Past terms**: choose "I know each term" or "Enter an opening balance".
     - *Each term*: one row per started term (date range): **Paid / Unpaid**. There is no default, and Save is disabled until every row is chosen.
       - Paid shows: amount (pre-filled with the fee), **Paid in full** (ticked), date (or a "Don't know the date" tick) and method.
       - Unticking Paid in full shows **Fee for this term** (pre-filled, labelled "Using current plan fee ₹1,000") and the balance left.
       - Unpaid shows "Owed at current plan fee ₹1,000".
     - *Opening balance*: one amount, an optional "of which admission fee ₹__", and the note "Covers everything up to today, including the current term. Billing continues from <cut-over>."
   - **Admission fee was paid** (off by default): date or "don't know", and method.
   - A **warning** (non-blocking) above 12 terms: "Joined 14 terms ago. Check the joining date is right."
   - **Summary**: original joining date, registration date (today), number of terms, total paid, total outstanding, and resulting status (Paid / Overdue / Balance due).
3. **"Date not recorded"** replaces the date in `PaymentHistoryItem`, ledger rows (Insights, day ledger, Expenses earnings), CSV exports, and member-app receipts and invoice PDF.
4. **Fee sheet (Collect)**: an "Opening balance" line while `openingBalanceDue > 0`, with the admission part shown if one was given.
5. **Member sheet**: existing members show "Registered in GymBoo: 2 Nov 2026" under Joined, and the opening balance with its breakdown.
6. **Member app** (`NextDueCard`): "+ ₹X opening balance" alongside the existing balance line.

### 4.6 Activity-log preparation (Phase 2)

`onboardingType`, `startDate` and `createdAt` are on every member. A pure helper `describeOnboarding(member)` (backend `utils/member.js`) returns *"Existing member added — Original joining date: 2 Aug 2026. Registered in GymBoo: 2 Nov 2026."* No log table in Phase 1.

## 5. Acceptance tests (`npm test`, Node's built-in `node:test`, no new dependencies)

- **Unit** (`backend/test/onboarding.billing.test.js`): the billing math with a fixed clock (today = 2 Nov 2026) on the default 30-day cycle.
- **Parity** (`backend/test/billing.parity.test.js`): every unit case also run through the admin-frontend copy, so the two can't drift.
- **Integration** (`backend/test/onboarding.db.test.js`): creates and drops a throwaway MySQL database. It is skipped when no `DB_*` credentials are set, and never touches `gym_admin`.

Unless stated otherwise: monthly ₹1,000, at-join, joined 2 Aug 2026, registered 2 Nov 2026, so the terms start on **2 Aug, 1 Sep, 1 Oct and 31 Oct**.

| # | Scenario | Expected |
|---|---|---|
| T1 | Spec 1: 2 Aug, 1 Sep, 1 Oct paid; 31 Oct unpaid | Only the 31 Oct term is outstanding (₹1,000), overdue (past its start + grace day). |
| T2 | Spec 2: 2 Aug, 1 Sep unpaid; 1 Oct paid; 31 Oct unpaid | Outstanding ₹3,000, listing exactly those three terms. 1 Oct is not listed. |
| T3 | Spec 3: three payments collected on 2 Aug, 1 Sep and 1 Oct, entered 2 Nov | Each is allocated to its own term with its real `payment_date`. `created_at` = 2 Nov. **November income from them = ₹0.** The 31 Oct term is not marked paid. |
| T3b | Same, all "date not recorded" | Counted on 2 Aug, 1 Sep and 1 Oct, with `dateKnown = false`. November income = ₹0. |
| T3c | Pay-after-term member, "date not recorded" | Counted at the **term start**, not the term end (Q2). |
| T4 | Spec 4: opening balance ₹3,000 | Outstanding = ₹3,000 exactly. **Zero payment rows.** `billing_cutover` = 30 Nov (the next term). The 31 Oct term is covered (C5). Not overdue, check-in allowed (D2). |
| T4b | Opening balance, then collect ₹1,000 and later ₹2,000 | The balance drops to ₹2,000, then ₹0. Each collection counts as income on the day collected. A 3rd collection → 409. |
| T4c | Opening balance ₹3,500, of which admission ₹500 (Q4) | Outstanding ₹3,500. Breakdown returned. **No admission row and no admission income.** Admission part > total → 400. |
| T4d | Opening balance, on 30 Nov | The 30 Nov term is a normal at-join term (pending, then overdue from 1 Dec). No term before 30 Nov is ever billable (C6). |
| T5 | Spec 5: new member | Same rows and statuses as today's `createMember` (snapshot), including the auto-paid first term. |
| T6 | Spec 6: double submit | Second request → 409. Still one member and no extra payments. A duplicate term in one request → 400. A missing term → 400. Both methods at once → 400. |
| T7 | Q1, ticked: 1 Sep paid ₹800 with fee ₹1,000 | Stored `amount = 800`, `period_fee = 800`. The term is settled. No balance. |
| T7b | Q1, unticked: 1 Oct paid ₹500, term fee ₹1,000 | Stored `amount = 500`, `period_fee = 1000`. The term shows a ₹500 balance, not overdue. `amount ≥ termFee` → 400. |
| T8 | Q3: joining date exactly 24 months back | Accepted. 24 months + 1 day back → 400. |
| T8b | Q3: more than 12 terms | Accepted, with a `warnings` entry. 12 terms or fewer → no warning. |
| T9 | D3: admission paid, date unknown | One admission row dated the joining date with `dateKnown = false`. Not ticked → no admission row. |
| T10 | C4: edit an existing member's name or phone, then the admission amount | The admission row keeps its `payment_date` and `date_known` on both edits. A `'new'` member keeps today's behaviour (re-dated to the joining date). |
| T11 | D4/C2: scheduled reminder run on days 0, 1, 2 and 3 after registration | Existing member skipped on days 0–2, included on day 3 if outstanding > 0, skipped if cleared. `'new'` members are unaffected on every day. |
| T11b | C2/C3: manual reminder on day 0 | The admin button includes the existing member. The WhatsApp reminder is unaffected (no code change; manual check). |
| T12 | C1: a gym on a 30-day cycle | Terms are 30 days apart (2 Aug, 1 Sep, 1 Oct, 31 Oct), never calendar months. A month-start gym gets its configured calendar-month terms. |
| T13 | Data safety: existing data before vs after migration | Every existing member and payment row is unchanged (field by field). New columns hold their defaults. Every status and outstanding amount is identical. |

## 6. Backward compatibility

- All new columns have defaults that reproduce today's behaviour. No existing payment or member row is rewritten, re-dated or reclassified (T13).
- The new-member API body and flow are unchanged (T5).
- `billingStartKey` changes only when `billing_cutover` is set, which only method-B members have.
- `syncAdmissionPayment` changes only for `onboarding_type = 'existing'` members (T10).
- The JSON fallback store gets the same fields with the same defaults.
- **Deploy order:** the backend first (migration runs on boot), then the admin and member-app builds. An old admin build against the new backend still works; it just can't create existing members.

## 7. Files to be modified

Backend: `schema.sql`, `migrations/005-existing-member-onboarding.sql` (new), `services/migrationService.js`, `utils/billing.js`, `utils/member.js`, `models/paymentModel.js`, `models/memberModel.js`, `models/fallbackModel.js`, `services/memberService.js`, `services/onboardingService.js` (new), `services/paymentService.js`, `services/notificationService.js`, `services/autoNotificationService.js`, `controllers/memberController.js`, `test/*` (new), `package.json` (`test` script).

Admin frontend: `lib/billing.js`, `lib/ledger.js`, `dialogs/MemberDialog.jsx`, `dialogs/MemberTypeDialog.jsx` (new chooser), `components/ExistingMemberHistory.jsx` (new), `dialogs/FeeDialog.jsx`, `dialogs/DetailDialog.jsx`, `components/PaymentHistoryItem.jsx`, `views/InsightsView.jsx` (CSV), `store/AppProvider.jsx`, `style.css`.

Member app: `components/NextDueCard.jsx`, `components/InvoicesCard.jsx`, `views/MemberReceipts.jsx`, `lib/receipt.js`.

## 8. Implementation notes (as built)

- **The period key is `'opening-balance'`, not `'opening'`.** Existing code treats any 7-character period key as a calendar month (`YYYY-MM`), and `'opening'` is 7 characters long.
- **The New/Existing chooser is the first step of `MemberDialog`** (`AddMemberFlow`), not a separate `MemberTypeDialog.jsx`. The four "Add member" buttons are unchanged.
- **The form's rules live in `admin-frontend/src/lib/onboarding.js`** (pure functions, tested). `components/ExistingMemberHistory.jsx` only renders them.
- **The reminder filter is `notificationService.feeReminderRecipients`**, shared by the scheduled run and the manual button, and tested without push credentials.
- **Editing an existing member's joining date** re-keys their paid terms (`c7b62d9`). A payment with no recorded date also moves its stand-in date to the new term start. A recorded date never changes.
- **Tests:** `npm test` runs `backend/test/onboarding.billing.test.js` (14 cases: billing math through both copies, the form's rules, the reminder hold) and `backend/test/onboarding.db.test.js` (11 cases on a throwaway MySQL database, skipped without `DB_*`).

## 9. Choices made while writing the plan up (flag if you disagree)

- **A1. "Historical pricing if available" (Q1).** GymBoo stores no price history for a member entered today: plan-change logs only exist for changes made inside GymBoo. So the historical fee comes from the owner. Unticking Paid in full shows a "Fee for this term" field, pre-filled with the current plan fee and labelled "Using current plan fee ₹1,000".
- **A2. Unpaid historical terms are owed at the current plan fee.** Outstanding has always been "unpaid terms × fee", and an unpaid term has no row that could hold a different price. The screen states the fee used. A different owed amount goes through the opening-balance method.
- **A3. The admission part of an opening balance is display only.** A payment toward the opening balance reduces the total. It isn't split between dues and admission.
