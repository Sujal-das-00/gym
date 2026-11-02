# Phase 3: Membership lifecycle (renewals, upgrades, downgrades, history)

Technical implementation plan · drafted 2 Nov 2026 · status: **audit done, awaiting decisions, no code written**

Builds on Phase 1 (implemented in the working tree, uncommitted, 25/25 tests passing) and Phase 2 (**planned, not built**; see §2, blocker B1).

---

## 1. Audit: what exists today

| Spec area | Current implementation | Reuse / change |
|---|---|---|
| Membership "plans" | **There is no plan catalog.** A plan is four fields on the member row: `membership_type` (`monthly`/`package`), `package_months`, `fee`, `collection_timing`. Each member's fee is typed in individually. No plan ID, no plan name ("Basic", "Premium"), no "available plans" list. | Decision L1. |
| Membership periods | **Not stored.** Terms are computed by `getBillingPeriodKeys` on a fixed grid from `billingStartKey` (= `plan_start_date` ‖ `billing_cutover` ‖ `start_date`) up to today, using the gym's cycle (30 days, custom days, calendar month) or the package length. A term is identified by its start key (`2026-11-01`). | Keep. No term table (as in the Phase 2 plan). |
| Membership history | `member_plan_changes` logs each plan change since 28 Oct 2026: old/new plan **snapshots**, `effective_date`, `changed_at`, who, dues collected/waived, first term collected. Payments keep `period_fee`, so a past term's price survives later fee changes. The member sheet already lists plan changes and payments separately. Plan edits made before 28 Oct 2026 went through a plain profile save and were **not logged**. | Build the history view from these (L2). |
| Expiry / "Expired" | `isMembershipExpired` = some started term is unpaid past its due point (at-join: the day after it starts; fixed-day: the day after it ends). Part-paid terms and the Phase 1 opening balance never expire a member. Both billing copies (`backend/src/utils/billing.js`, `admin-frontend/src/lib/billing.js`) must agree. | Reuse unchanged. |
| Renewal | **There is no renewal operation.** Renewing = paying the next term on the grid through the fee sheet (`POST /members/:id/payments`). The fee sheet only lists **terms that have started**, so an at-join member can't renew before the term starts. | L3. |
| Renewal after a lapse | Established rule (confirmed with you on 2 Nov 2026): **paying late does not move the cycle.** A member who lapsed on 30 Oct and comes back on 2 Nov owes the 31 Oct term. A member away for 3 months owes 3 terms. There is **no way to restart a cycle on the same plan**: "Change plan" refuses an unchanged plan (`samePlan` → 400). | L4. |
| Upgrade / downgrade | One generic **"Change plan"** flow (`POST /members/:id/plan`, `planChangeService`), with no upgrade/downgrade distinction. The effective date can be anywhere from the **current plan's start** to the next renewal. Default: the next renewal. Billing restarts on the effective date. Unpaid old-plan terms before it must be **collected or waived** (409 otherwise). For at-join plans, the new plan's first term can be collected with the change, **at the full new fee**. There is **no proration and no credit** for unused paid days when a change starts mid-term. | L5–L8. |
| Effective vs entry vs collection dates | Already separate: `member_plan_changes.effective_date` vs `changed_at`; `payments.payment_date` vs `created_at`. | Reuse. |
| Future-effective changes | Supported up to the next renewal. `plan_start_date` is set to the future date at once (the member row shows the new fee immediately). Until then the member reads as paid (the old term had to be settled). No way to cancel a scheduled change. | Reuse. |
| Statuses | Fee status: Paid / Pending / Balance due / Overdue. Membership: active vs expired (above), plus "plan change ahead". **No Cancelled or Suspended state.** "Delete" is a soft archive. | L9. |
| Check-in | `checkinService`: refused only when `isMembershipExpired` **and** the gym's `allow_expired_checkin` is off. Opening balances and part-paid balances never block. | **No change proposed.** |
| Concurrency / duplicates | Plan change: one DB transaction, with an optimistic lock (the UPDATE only applies if the plan still matches). Payments: `addPayments` inserts row by row, **with no transaction, no lock and no idempotency key**. Two simultaneous renewals of one term both succeed and over-pay it. | Phase 2 §3.2 fixes this (B1). |
| Server validation of terms | `preparePeriodPayments` **accepts any period key**: a term that hasn't started, or one not on the member's grid at all. The UI never sends one, but the API allows it. | Fix (always, whatever L3 says). |
| Backdated plan changes | A change may be backdated to the plan's start, so terms **already paid** on the old plan come under the new plan. On a switch between monthly and package, already-paid term keys no longer line up with the new grid. | L7. |
| Payments / Phase 2 | Phase 2's transaction records, reversals, corrections and idempotency **do not exist in the code**. `docs/phase-2-payment-management.md` is a plan whose decisions P1–P10 are still open. | B1. |
| Tests | `npm test` (Node `node:test`): 14 billing unit tests + 11 integration tests on a throwaway MySQL database. 25/25 pass. | Extend. |

## 2. Blockers and conflicts with the spec

**B1. Phase 2 isn't built.** The spec relies on it: payment allocation, idempotent recording, reversals and corrections (spec §9, tests 13 and 14). Without it, a renewal is a plain payment row written with no lock, and "reversal compatibility" has nothing to be compatible with. Phase 1 is also still uncommitted.

**Conflicts:**

1. **No plan catalog**, so there are no "available upgrade plans", no plan IDs and no plan names (spec §2, §4). An upgrade is "a new fee/type typed in". Comparing a monthly plan with a package needs a rule. Proposal: compare the **monthly-equivalent price** (fee ÷ months).
2. **No membership-period records.** The spec's "membership record per period" maps to *plan segments* (already recorded in `member_plan_changes`) plus *computed terms*. A new table would duplicate what the billing engine computes, and it would have to be kept in sync with it.
3. **"Renewal after expiry should not silently extend from the old expiry"**: here that *is* the established rule (L4). Keeping it means the late renewal pays the lapsed term.
4. **"Financial dues alone must not determine check-in"**: the existing gate refuses an expired member (an unpaid term of the *current plan*, past its due point) when the gym turns expired check-in off. That is membership validity, not general dues. Balances (part payments, opening balance) already never block. No change proposed.
5. **"Upgrading must not erase outstanding balances"**: today unpaid old-plan terms must be collected or **waived** before a change. A waive is explicit and logged (`dues_waived`), but it does remove the debt. L8 adds a third option that keeps it.
6. **Cancelled / Suspended states don't exist** (L9).

## 3. Decisions needed (recommendation in bold)

| # | Question | Options |
|---|---|---|
| B1 | Order of work | **Commit Phase 1, build Phase 2, then Phase 3** / build Phase 3 on today's payment rows, adding only a member-row lock and a request ID for lifecycle operations, and drop the reversal tests |
| L1 | Plans | **Keep per-member plans; label a change Upgrade/Downgrade by monthly-equivalent price, stored with the change** / add a per-gym plan catalog (named plans, a settings screen, a plan picker on add-member; bigger scope) |
| L2 | Where membership history lives | **Built from existing records (joining date, `member_plan_changes`, payments) plus three columns on `member_plan_changes`; no new table** / a new `memberships` table, one row per plan segment, backfilled |
| L3 | Renewal before expiry | **Allow paying the next term while the current one is paid (at-join only, one term ahead). The grid doesn't move, so no days are lost: 1–30 Nov, then 1–30 Dec** / no early renewal (today) |
| L4 | Member returning after a lapse | **Keep the grid (pay the lapsed terms) and add "Restart membership": the same plan on a new cycle from the return date. Lapsed terms: collect, waive or keep as balance (L8)** / grid only (today) |
| L5 | Upgrade pricing | **Today's rule: no proration. At the next renewal (default), or immediately on a new cycle at the full new fee, with unused old-plan days not credited** / immediate, keeping the cycle, collecting a flat difference (₹500) for the current term / prorated difference for the days left (a new pricing policy) |
| L6 | When a downgrade takes effect | **At the next renewal only. The paid term finishes on the old plan; no refund** / also immediately (remaining paid days forfeited, no refund) |
| L7 | Earliest effective date of a change | **The start of the current term, so already-paid earlier terms are never re-planned** / the current plan's start (today) |
| L8 | Unpaid old-plan terms at a change or restart | **Add "Keep as balance due" beside collect and waive. Kept terms stay owed at their own fee and are paid through the fee sheet. Like an opening balance, they never expire the membership or block check-in** / collect or waive only (today) |
| L9 | Statuses | **Membership: Active / Expired / Scheduled (first term not started), plus an "upcoming change" marker, all derived from the existing engine. No Cancelled/Suspended in Phase 3** / also add "Cancel membership" (stops billing from a date; check-in refused; new rule) |

## 4. Design (assuming the recommendations)

### 4.1 Data model (adds only)

`member_plan_changes` gains:

| Column | Purpose |
|---|---|
| `change_type ENUM('change','upgrade','downgrade','restart') NOT NULL DEFAULT 'change'` | Classified once at save (L1). Existing rows stay `'change'` (backfill can classify them from their snapshots). |
| `request_id CHAR(36) NULL`, `UNIQUE (tenant_id, request_id)` | Idempotency. A repeated submit returns the first result. |
| `dues_carried DECIMAL(10,2) NOT NULL DEFAULT 0` | Total kept as balance (L8). |

New `member_carried_terms (id, tenant_id, member_id, change_id, billing_period, fee, created_at)`, `UNIQUE (member_id, billing_period)` (L8 only). These are the old-plan terms kept as balance. Their keys always start before the new plan's effective date, so they can't collide with a new-grid term. Payments against them are ordinary membership rows with that key. The existing ledger settles them unchanged.

No change to `members`, `payments` or any existing row. Migration `006-membership-lifecycle.sql` plus the same in `migrationService.ensureFeatureColumns` and `schema.sql`.

### 4.2 Billing engine (both copies, kept in sync by the parity tests)

- `membershipStatus(member, settings)` → `active` / `expired` / `scheduled`, from `getBillingPeriodKeys` and `isMembershipExpired`. No new date math.
- `carriedBalanceDue(member)`: carried terms minus what is paid on them. It is added to outstanding amounts and reminders, **not** to `dueUnpaidPeriods`/expiry (same treatment as the opening balance).
- `nextRenewableTerm(member, settings)` (L3): the term after the current one, for at-join members whose current term is settled. `memberBillingSummary` and "paid until" read through to the end of the furthest paid term.
- `planSegments(member, changes)`: replays the logged changes into segments. Terms of past segments are generated by the same `getBillingPeriodKeys`, on a member copy with the segment's plan, clipped to the segment end. Used only by the history view.

### 4.3 Renewal

- No new record type. A renewal is a payment on the next term, through the existing payment path (Phase 2 transaction, lock and request ID).
- **Server validation (fix):** every membership period key must be a term on the member's schedule: a started term, a carried term, the opening balance, or, under L3, the single next term. Anything else → 400.
- **Before expiry (L3):** the fee sheet offers "Renew: 1 Dec – 30 Dec" once the current term is paid. The paid-until date moves; the grid doesn't.
- **After expiry:** unchanged. The oldest lapsed term is pre-selected. Or **Restart membership** (L4): `POST /members/:id/plan` with the same plan and `restart: true`, effective from the return date. Logged as `restart`. Lapsed terms are collected, waived or kept (L8).
- **Duplicates:** two renewals of one term can't both succeed (row lock and over-payment check); a resubmitted request is a no-op (request ID).

### 4.4 Upgrade and downgrade

`POST /members/:id/plan` (backward compatible) gains `requestId` and `oldDues: "carry"`, and returns a money summary: plan price, amount payable now, collected now, outstanding before and after.
- **Upgrade:** effective at the next renewal (default) or immediately (new cycle, full new fee, L5). The sheet states plainly that unused days aren't credited.
- **Downgrade:** next renewal only (L6). The date picker is fixed to the renewal date.
- **Every change:** earliest effective date = start of the current term (L7). Paid terms are never re-planned. A change records no income itself; only the money actually collected, written as payments, is income.

**Admin UI:** the "Change plan" sheet shows:
1. The current plan and "paid until".
2. The new plan, with an **Upgrade / Downgrade** chip and the per-month difference.
3. The effective date, with a line explaining it.
4. Old dues: collect, keep or waive.
5. A confirm step with the money summary.

### 4.5 Membership history

`GET /api/members/:id/membership-history` (gym-scoped, read-only), shown as a new **Membership** tab in the member sheet. It replaces the separate "Plan changes" list there; Insights keeps its log.

Chronological entries:
- Joined (with the plan inferred from the first logged change, labelled "plan at joining not recorded" for members changed before 28 Oct 2026). Existing members also show "Added to GymBoo on …".
- Each term ("Renewed — ₹1,000/month · 1 Nov – 30 Nov"), with its fee, paid / part / unpaid / carried, and payment references.
- Each change: Upgraded / Downgraded / Changed / Restarted, with from, to, effective date, recorded on and by whom, and dues collected / kept / waived.

Each entry expands to the spec's fields. Every entry is built from snapshots, so a later fee edit never rewrites it.

### 4.6 Member app

The NextDueCard shows "Paid until 30 Dec" after an early renewal, and carried balances on the existing balance line. No receipt changes.

## 5. Tests (all automated, both billing copies)

Default: ₹1,000/month, at-join, 30-day cycle, today 2 Nov 2026, plus month-start and package gyms.

1. Early renewal: term 1–30 Nov paid; renewing pays 1–30 Dec; paid until 30 Dec; the grid is unchanged (L3).
2. Late renewal: lapsed on 30 Oct, paying on 2 Nov settles the 31 Oct term; the cycle doesn't move.
3. Three consecutive renewals; a package's renewals; month-end starts (31 Jan → 28/29 Feb), leap years (29 Feb 2028) and custom-day cycles.
4. Restart: the same plan on a new cycle; lapsed terms collected, kept or waived; logged as `restart`.
5. Upgrade (₹1,000 → ₹1,500) at renewal and immediately (new cycle at full fee; earlier paid terms untouched).
6. Downgrade only at renewal; an immediate downgrade → 400; no refund rows; paid terms keep their `period_fee`.
7. A future-effective change: the member stays Active on the old plan until it starts; it's never active early.
8. Backdating before the current term → 400 (L7).
9. History: every segment, term and change survives later changes and fee edits; the order is chronological.
10. Dues: upgrade and renewal with unpaid terms (collect / keep / waive); a kept balance is still owed, isn't overdue and doesn't block check-in; a renewal doesn't settle old dues.
11. Part payments during a renewal and an upgrade.
12. Duplicates: the same `requestId` twice → one change; two parallel renewals of one term → no over-payment; a stale plan → 409.
13. Period-key validation: a future term (except under L3), an off-grid key or garbage → 400.
14. Check-in eligibility after each operation, with `allow_expired_checkin` on and off.
15. Reversal compatibility (needs Phase 2): reversing a renewal payment makes the term unpaid again; reversing the payment taken with a change doesn't undo the change.
16. Gym isolation: another gym's member → 404 on history, change and renewal.
17. Migration: re-runnable; every existing member's statuses and outstanding amounts are identical before and after.
18. Regression: all Phase 1 tests, plus the Phase 2 suite once built.

## 6. Backward compatibility

- Additive columns and one new table. No existing row is rewritten.
- The old `/plan` body (no `requestId`, `oldDues` collect/waive) still works.
- An old admin build against the new backend loses only the new screens.
- **Behaviour changes, once approved:** the server rejects period keys the UI never sends (the fix); downgrades are limited to the renewal date (L6); backdating is limited to the current term (L7).
- **Deploy order:** backend first (migration on boot), then the admin and member-app builds.

## 7. Files expected to change

**Backend:** `schema.sql`, `migrations/006-membership-lifecycle.sql` (new), `services/migrationService.js`, `utils/billing.js`, `services/planChangeService.js`, `services/paymentService.js`, `services/membershipHistoryService.js` (new), `models/memberModel.js`, `models/paymentModel.js`, `models/fallbackModel.js`, `controllers/memberController.js`, `routes/apiRoutes.js`, `test/lifecycle.billing.test.js` (new), `test/lifecycle.db.test.js` (new).

**Admin:** `lib/billing.js`, `lib/planChanges.js`, `dialogs/PlanDialog.jsx`, `dialogs/FeeDialog.jsx`, `dialogs/DetailDialog.jsx`, `components/MembershipHistory.jsx` (new), `store/AppProvider.jsx`, `style.css`.

**Member app:** `components/NextDueCard.jsx`.
