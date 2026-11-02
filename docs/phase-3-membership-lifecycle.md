# Phase 3: Membership lifecycle (renewals, upgrades, downgrades, history)

Technical implementation plan · drafted 2 Nov 2026 · revised 2 Nov 2026 · status: **implemented on the working tree (uncommitted); `npm test` 75/75 (Phase 1's 25, Phase 2's 27, Phase 3's 23)**

Builds on Phase 1 (`deb3723`) and Phase 2 (`0f12150`), both committed. Baseline before Phase 3: `npm test` **52/52** (Phase 1's 25, Phase 2's 27). All 52 stay as regression tests.

---

## 1. Approved decisions

| # | Decision | What it means in the code |
|---|---|---|
| B1 | **Build on the current tree; never commit, stash, reset or discard.** | Phase 1 and 2 are already committed. Phase 3 is left as uncommitted changes. |
| L1 | **Per-member plans, no catalog.** Upgrade/Downgrade by normalised monthly price. | `monthlyEquivalent(plan, settings)`: a package's fee ÷ its months. A monthly fee is per cycle, so on a custom-day cycle it is scaled to 30 days. Classified once at save and stored (`change_type`). |
| L2 | **Existing records plus three columns, no memberships table** (verified in §3). | `member_plan_changes.change_type`, `.request_id`, `.dues_detail`. |
| L3 | **Pay one term ahead; the cycle never moves.** | An explicit `renewAhead` opt-in on Record payment adds exactly one term: the one after the current term. At-join members only. Never two ahead. Never reached by FIFO by accident. |
| L4 | **Missed terms stay owed. A separate Restart membership action.** | `POST /members/:id/plan` with `restart: true`. Same plan, new cycle from the return date. Only for a member who is expired. Lapsed terms need an explicit collect, waive or keep. |
| L5 | **Upgrades: no proration.** At the next renewal, or immediately at the full new fee. | Unused days of a paid term are not credited. Earlier terms and payments are untouched. |
| L6 | **Downgrades: next renewal only.** No refund, no retroactive change. | Any other effective date → 400. |
| L7 | **Earliest effective date = start of the current term. Paid terms never move to the new plan.** | The new plan's first term must start after every term that has money on it. |
| L8 | **Collect now / Waive / Keep as balance due.** Kept dues stay visible and never block check-in. Waivers stay auditable. | Required choice. Every affected term is itemised in `dues_detail`. Kept terms are billed as balances, like part payments and opening balances. |
| L9 | **Active / Expired / Scheduled only.** | Derived from the existing engine. Scheduled = joining date still ahead. |

## 2. Audit (as built, Phase 1 and 2 included)

| Area | Finding | Phase 3 handling |
|---|---|---|
| Plans | Four fields on `members`: `membership_type`, `package_months`, `fee`, `collection_timing`. No catalog. | L1 classification only. |
| Terms | Computed by `getBillingPeriodKeys` from `billingStartKey` = `plan_start_date` ‖ `billing_cutover` ‖ `start_date`. A term is `(member_id, billing_period)`. | Unchanged. No term table. |
| Plan history | `member_plan_changes`: old/new snapshots, `effective_date`, `changed_at`, who, dues collected/waived amounts, first term collected. Shown per member and in Insights. | History view built from it (§3). |
| Payments | Phase 2: `payment_transactions` (money received) over `payments` allocations. The member row is locked (`withMemberLock`). `request_id` makes a retry return the first result. Corrections and reversals are by reverse-and-replace. Allocation is FIFO or manual, and only to eligible debts (started terms, plus the opening balance). | Every lifecycle payment goes through it. |
| Server term validation | Phase 2 already rejects allocations to anything but an eligible debt. My first audit's "any period key accepted" gap is **closed**. | L3 adds exactly one eligible term (opt-in). |
| Plan change concurrency | `changeMemberPlan` read the member **outside** `withMemberLock`, with only an optimistic plan check. A desk payment on the same term could interleave. No `requestId`. | Moved inside `withMemberLock`; `request_id` added. |
| Backdating | The effective date could go back to the plan's start, re-planning paid terms. | L7. |
| Month-start overlap | On a calendar-month gym, a mid-month change makes the new plan's first term the **same month key** as the old plan's term. If that month was unpaid and waived or kept, the key would be billed twice. | That month belongs to the new plan; it is never listed as an old-plan due. If it's paid, the change waits for renewal (L7). |
| Expiry / check-in | `isMembershipExpired` = a started term unpaid past its due point. The check-in gate = expired **and** `allow_expired_checkin` off. Balances (part paid, opening) never block. | Unchanged. Kept dues behave as balances. |
| Reversal guard (P6) | Allocations on terms before `billingStartKey` can't be reversed, so their debt can't silently vanish. | Kept terms are still billed, so they are exempt. Everything else is unchanged. |
| Tests | 52/52. One Phase 2 test backdates a plan change (`effectiveDate: 2026-10-01` with the current term starting 31 Oct). | That test moves to 31 Oct (L7). Its assertions are otherwise unchanged. |

## 3. L2 verification: can existing records hold the history accurately?

| History needs | Already stored | Gap → fix |
|---|---|---|
| Plan of each period, as it was | Change snapshots (`old_*`/`new_*`); `members` = current plan | — |
| Effective date vs date recorded | `effective_date`, `changed_at` | — |
| Who made the change | `changed_by_*` | — |
| Price of each past term | `payments.period_fee` per allocation | — |
| Payment references per term | Transactions and allocations (Phase 2) | — |
| Upgrade / downgrade / restart | — | `change_type` (backfilled for existing rows) |
| Which terms were waived, collected or kept | Waived/collected **totals** only | `dues_detail` JSON: `{collected, waived, carried}` per term |
| Duplicate submit of a change | — | `request_id` + `UNIQUE (tenant_id, request_id)` |

**Limits that no schema change can fix** (they are shown as limits instead of guessed):
1. **Plan edits before 28 Oct 2026** went through a profile save and were never logged. For members registered before then, the history says "Plan details before 28 Oct 2026 may be incomplete".
2. **Changes logged before Phase 3** have waived **totals**, not terms. Their unpaid old-plan terms read "Waived with the plan change" (or "Not billed after the plan change" when nothing was waived).
3. **The gym's cycle setting isn't snapshotted.** Paid terms always show their real keys. Unpaid terms of past segments are recomputed on today's setting.

So no memberships table is needed.

## 4. Design

### 4.1 Schema (adds only): `007-membership-lifecycle.sql`, also in `migrationService` and `schema.sql`

```sql
ALTER TABLE member_plan_changes
  ADD change_type ENUM('change','upgrade','downgrade','restart') NOT NULL DEFAULT 'change',
  ADD request_id CHAR(36) NULL,
  ADD dues_detail JSON NULL,     -- {"collected":[{period,fee,amount}],"waived":[…{balance}],"carried":[…{fee,balance}]}
  ADD UNIQUE KEY uniq_plan_changes_request (tenant_id, request_id);
```

**Backfill:** `change_type` for existing rows, by the same monthly-equivalent rule in SQL. It runs once, when the column is added. No other row changes.

### 4.2 Billing engine (both copies, kept in sync by parity tests)

- **Prices and status:** `monthlyEquivalent`, `classifyPlanChange` and `membershipStatus` (`scheduled` / `expired` / `active`).
- **`planChangeWindow(member, settings)`:** `{ earliest, latest, paidStart }`.
  - `earliest` = start of the current term.
  - `latest` = the next renewal (after a term paid ahead), or today.
  - `paidStart` = the start of the newest current-plan term with money on it.
- **`unsettledBeforeChange`:** unpaid current-plan terms before the effective date, excluding the new plan's own first key (the month-start overlap).
- **One term ahead (L3):** `nextTermKey` / `advanceTerm`. Due dates, "package ends on" and the member app's renewal date read through a term paid ahead.
- **Kept terms:** `carriedTerms` / `carriedDues`. They are hydrated from `dues_detail.carried` and added to `balanceDue` / `getBalanceDue`. Every outstanding, reminder and "Balance due" figure picks them up, and they never count in `dueUnpaidPeriods`.

### 4.3 API

- **`POST /members/:id/payments`** gains `renewAhead: true` (L3). The response and the rest are unchanged.
- **`POST /members/:id/plan`** gains `requestId`, `restart`, and `oldDues: "collect" | "waive" | "carry"`. It runs inside `withMemberLock`. It returns `{ member, change }` (a repeated request returns the original change).
- **`GET /members/:id/membership-history`** returns `{ status, entries, notes }`:
  - Entries are chronological: Joined, Renewed, Upgraded, Downgraded, Changed, Restarted.
  - Each entry carries its plan, the previous plan, the effective date, the term's dates (start / last day), price, paid, balance, payment status, period state, payment references, and change details: dues collected / waived / kept, who, when and the note.

### 4.4 Admin UI

- **Change plan sheet:**
  - Shows the current plan and the paid-until date, with an **Upgrade / Downgrade / Change** chip and the per-month difference.
  - Effective-date choices follow the rules: a downgrade is fixed to the renewal date, and dates outside the window are disabled.
  - Old dues: three explicit choices, with no default.
  - A **Review → Confirm** step with the money summary: plan price, payable now, collected now, kept, waived.
- **Restart membership:** the same sheet in restart mode, opened from the member sheet when the member is expired.
- **Record payment:** a "Renew next term in advance (1 Dec – 30 Dec)" option. Kept terms are listed as "Earlier plan" debts.
- **Member sheet:** a membership status chip, a **Restart** action when expired, and a **Membership history** section (expandable entries) that replaces the old "Plan changes" list.
- **Insights → Plan changes:** uses the stored type; the CSV gains the type and kept columns.

### 4.5 Member app

The renewal card shows the paid-ahead date, plus a "+ ₹X earlier dues" line for kept terms.

## 5. Tests

**Unit and parity (both billing copies):**
- Classification, including packages and custom-day cycles.
- Window, ahead term, kept dues and status.
- Month-end (31 Jan → package), leap year (29 Feb 2028), month-start and package gyms.

**DB and HTTP:**
- Early, late and consecutive renewals; one-ahead only.
- Restart (collect / waive / keep, not when active, no duplicate terms).
- Upgrade now and at renewal; downgrade at renewal only.
- A future-effective change stays Active and is never early.
- L7 backdating and paid-term guards; month-start overlap.
- History preservation; dues with upgrade and renewal; kept balance never blocks check-in.
- Part payments during renewal and upgrade.
- Reversal compatibility (kept terms reversible, P6 kept).
- Duplicate and concurrent change requests; gym isolation; migration backfill and re-run.

**Regression:** all 52 Phase 1 and 2 tests.

## 6. Backward compatibility

- Additive columns only. Existing rows keep every value, except the one-time `change_type` backfill.
- Old request bodies work: `/plan` without `requestId`, with `oldDues` collect/waive; payments without `renewAhead`.
- **Intended behaviour changes:**
  - Plan changes can't start before the current term (L7).
  - Downgrades only at renewal (L6).
  - Waive/keep no longer double-bills a month-start overlap.
  - One term ahead is payable on request (L3; replaces P9 for that one term).
- **Deploy order:** backend (migration on boot), then the admin and member-app builds.

## 7. Implementation notes (as built)

### 7.1 Deviations from the plan

- **No `membershipHistoryService.js`.** The history builder is a pure function in `utils/membershipHistory.js` (unit-tested without a database). `planChangeService.getMembershipHistory` loads the member and the log and calls it.
- **Kept terms live in `dues_detail.carried`, not a new table.** They are hydrated onto `member.carriedTerms` when members load (one extra query per chunk of members). The three-column limit holds.
- **Renewing ahead is opt-in on both sides.**
  - Server: `renewAhead: true` adds the next term to the payable debts. Without it, Phase 2's P4 still rejects any amount above what's owed, so a too-large amount never turns into an advance by accident.
  - Admin: a "Renew next term in advance" tick box, plus a **Renew** action on the member sheet when nothing is owed.
- **The Phase 2 correction flow** keeps the paid-ahead term selectable when the payment being corrected renewed it.

### 7.2 Decided while building (flag if you disagree)

- **Manual allocation can't pay ahead while a current-plan term is still due** ("Clear the terms already due…"). Opening balances and kept dues don't hold a renewal up.
- **An immediate change is refused when the current term started today and is already paid.** The new plan's first term would take over that paid term (L7). The sheet greys out "Now"; the change can start tomorrow or at renewal.
- **On a calendar-month gym, a mid-month change makes that month the new plan's first term.** If the month is unpaid, it is billed once, at the new fee. If it is paid, the change waits for the 1st of next month.
- **Restart is only offered to an expired member.** It is dated from the current term's start up to today, and keeps the current plan as it is. A same-plan change for an expired member points to Restart.
- **Plan changes now run inside `withMemberLock`.** A desk payment can't land on a term while a change is collecting, waiving or keeping it.
- **A payment on a kept term can be reversed.** The term stays owed, so P6 has nothing to protect. Payments on terms closed some other way are still blocked by P6.
- **A term paid ahead of a scheduled change is closed by that change**, like the paid current term before one. P6 then blocks reversing it, as for any term before the plan start.
- **History "paid ahead" = a term that hasn't started yet but has money on it.**

### 7.3 Changed existing test

**Phase 2 T9c** (`payments.db.test.js`) backdated a plan change to 1 Oct, while the current term began on 31 Oct. L7 forbids that, so the change now starts on 31 Oct and collects 1 Sep and 1 Oct (previously only 1 Sep). Its P6 assertions are unchanged.

### 7.4 Tests

`npm test` runs **75/75**:
- **`lifecycle.billing.test.js` (8 tests):** both billing copies, run on the same cases:
  - classification, including packages and 25-day cycles;
  - the one-term-ahead renewal, with month-start, packages, 31 Jan and 29 Feb 2028;
  - the change window and the L5–L7 rules;
  - kept dues, statuses, and the history builder.
- **`lifecycle.db.test.js` (15 tests):** throwaway MySQL database, the real services, the real check-in gate and the real HTTP routes. Spec §12:
  - S1–S3: renewals before expiry, after expiry and consecutively;
  - S4–S7: upgrades now and scheduled; downgrades at renewal only;
  - S8 and S15: history and no overlapping periods;
  - S9–S12: dues kept, collected and waived; renewals with an opening balance; part payments;
  - restart (L4);
  - S13: reversals and corrections;
  - S14: repeated and concurrent requests;
  - S17: check-in with expired check-in turned off;
  - S20: gym isolation;
  - the boot migration and the SQL file, each run twice.
- **Regression (S18, S19):** all Phase 1 and Phase 2 tests.

Also checked:
- The JSON fallback store, with an in-memory smoke run (persistence stubbed out).
- Both frontends build (`vite build` into a temp directory).

**Not done:** clicking through the new screens in a browser.

### 7.5 Files

**Backend:**
- Modified: `schema.sql`, `src/services/migrationService.js`, `src/utils/billing.js`, `src/utils/member.js`, `src/services/planChangeService.js`, `src/services/paymentService.js`, `src/models/memberModel.js`, `src/models/fallbackModel.js`, `src/controllers/memberController.js`, `src/routes/apiRoutes.js`, `src/middleware/errorHandler.js`, `test/payments.db.test.js` (T9c).
- New: `migrations/007-membership-lifecycle.sql`, `src/utils/membershipHistory.js`, `test/lifecycle.billing.test.js`, `test/lifecycle.db.test.js`.

**Admin:**
- Modified: `src/lib/billing.js`, `src/lib/payments.js`, `src/lib/planChanges.js`, `src/dialogs/PlanDialog.jsx` (rewritten), `src/dialogs/FeeDialog.jsx`, `src/dialogs/DetailDialog.jsx`, `src/dialogs/PaymentActionDialog.jsx`, `src/components/PaymentFields.jsx`, `src/store/AppProvider.jsx`, `src/views/InsightsView.jsx`, `src/views/MembersView.jsx`, `style.css`.
- New: `src/components/MembershipHistory.jsx`.

**Member app:** `src/components/NextDueCard.jsx`.
