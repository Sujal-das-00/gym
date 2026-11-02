/**
 * A member's membership history, rebuilt from what is already stored: the
 * joining date (and an opening balance's cut-over), the plan-change log
 * (snapshots, effective dates, term-by-term dues) and the payments. No
 * membership rows exist to drift out of step with billing; every term comes
 * from the same grid getBillingPeriodKeys() bills.
 *
 * The plan's life is cut into segments: joining → first change → next change
 * … Each segment's terms are generated on its own plan from its own start and
 * end where the next segment begins. A change that a later one replaced
 * before it started has no terms.
 */
const {
  OPENING_PERIOD_KEY,
  collectionTiming,
  dueUnpaidPeriods,
  getBillingPeriodKeys,
  getPeriodLedger,
  isAdmissionPayment,
  membershipStatus,
  paymentPeriodKey,
  periodEndDate,
  carriedDues,
  termKeyFor,
  termStartKey,
} = require("./billing");
const { todayKey } = require("./date");

// Plan edits went through a plain profile save, unlogged, until this day.
const PLAN_LOG_STARTED = "2026-10-28";

function localKey(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayBefore(key) {
  const [year, month, day] = key.split("-").map(Number);
  return localKey(new Date(year, month - 1, day - 1));
}

const planOf = (source, settings) => ({
  membershipType: source.membershipType === "package" ? "package" : "monthly",
  packageMonths: Number(source.packageMonths || 1),
  fee: Number(source.fee || 0),
  collectionTiming: source.collectionTiming || collectionTiming(source, settings),
});

function buildMembershipHistory(member, changes, settings) {
  const today = todayKey();
  // In the order they were made. Effective dates never go backwards (a change
  // can't start before the current term), so they settle a same-instant tie.
  const ordered = [...(changes || [])].sort(
    (a, b) => String(a.changedAt).localeCompare(String(b.changedAt)) || String(a.effectiveDate).localeCompare(String(b.effectiveDate)),
  );

  const segments = [
    {
      start: member.billingCutover || member.startDate,
      plan: ordered.length ? planOf(ordered[0].from, settings) : planOf(member, settings),
      change: null,
    },
  ];
  for (const change of ordered) {
    const last = segments[segments.length - 1];
    // Saved for the same day as (or before) the one before it started: that one never ran.
    if (change.effectiveDate <= last.start) last.replacedBy = change;
    segments.push({ start: change.effectiveDate, plan: planOf(change.to, settings), change });
  }
  segments.forEach((segment, index) => {
    segment.end = segments.slice(index + 1).find((next) => next.start > segment.start)?.start || "";
    segment.probe = { ...member, ...segment.plan, planStartDate: segment.start, billingCutover: "" };
  });

  // Which segment each term key belongs to: later segments win a shared key
  // (a mid-month change on a calendar-month gym shares that month).
  const owner = new Map();
  segments.forEach((segment, index) => {
    if (segment.replacedBy) return;
    for (const key of getBillingPeriodKeys(segment.probe, settings)) {
      if (!segment.end || termStartKey(key) < segment.end) owner.set(key, index);
    }
  });
  const segmentAt = (key) => {
    let found = 0;
    segments.forEach((segment, index) => {
      if (!segment.replacedBy && termStartKey(termKeyFor(segment.probe, settings, segment.start)) <= termStartKey(key)) found = index;
    });
    return found;
  };
  // Paid terms the grid no longer lists (a term paid ahead, or a cycle setting changed since).
  for (const payment of member.payments || []) {
    const key = paymentPeriodKey(payment);
    if (isAdmissionPayment(payment) || key === OPENING_PERIOD_KEY || !key || owner.has(key)) continue;
    owner.set(key, segmentAt(key));
  }
  for (const term of member.carriedTerms || []) if (!owner.has(term.period)) owner.set(term.period, segmentAt(term.period));

  const ledger = getPeriodLedger(member);
  const kept = new Map(carriedDues(member, ledger).map((due) => [due.period, due]));
  const overdue = new Set(dueUnpaidPeriods(member, settings));
  const transactions = (member.transactions || []).filter((tx) => tx.status === "active");

  const terms = [...owner.entries()]
    .sort((a, b) => termStartKey(a[0]).localeCompare(termStartKey(b[0])))
    .map(([key, index]) => {
      const segment = segments[index];
      const closedBy = segments[index + 1]?.change || null;
      const entry = ledger.get(key);
      const detail = closedBy?.duesDetail || null;
      const waived = detail?.waived?.find((due) => due.period === key);
      const keptDue = kept.get(key);
      const start = termStartKey(key);
      let endKey = localKey(periodEndDate(segment.probe, settings, key));
      if (segment.end && segment.end > start && segment.end < endKey) endKey = segment.end;
      const charge = entry ? (entry.legacy ? entry.paid : entry.charge) : keptDue ? keptDue.charge : waived ? waived.fee : segment.plan.fee;
      const paid = entry ? Math.round(entry.paid * 100) / 100 : 0;

      let status;
      if (entry?.settled) status = "paid";
      else if (keptDue) status = "kept";
      else if (waived) status = "waived";
      else if (segment.end && segment.end <= today) {
        // Closed by a change logged before dues were itemised.
        status = closedBy && Number(closedBy.duesWaived || 0) > 0 ? "waived" : "not-billed";
      } else status = entry ? "part" : "unpaid";
      const balance =
        status === "kept" ? keptDue.balance : ["part", "unpaid"].includes(status) ? Math.max(0, Math.round((charge - paid) * 100) / 100) : 0;

      return {
        period: key,
        start,
        lastDay: dayBefore(endKey),
        fee: charge,
        paid,
        balance,
        status,
        overdue: overdue.has(key),
        state: start > today ? "scheduled" : dayBefore(endKey) < today ? "ended" : "current",
        // Money on a term that hasn't started yet: renewed ahead.
        paidAhead: start > today && paid > 0,
        cutShort: endKey === segment.end,
        segment: index,
        payments: transactions.flatMap((tx) =>
          tx.allocations
            .filter((allocation) => allocation.billingPeriod === key)
            .map((allocation) => ({
              transactionId: tx.id,
              date: tx.date,
              dateKnown: tx.dateKnown !== false,
              amount: allocation.amount,
              mode: tx.mode,
              reference: tx.reference || "",
              source: tx.source || "",
            })),
        ),
      };
    });

  const entries = [];
  segments.forEach((segment, index) => {
    const own = terms.filter((term) => term.segment === index);
    const change = segment.change;
    let first = null;
    if (change) {
      const key = termKeyFor(segment.probe, settings, change.effectiveDate);
      if (own[0]?.period === key) first = own.shift();
      entries.push({
        id: change.id,
        type: change.changeType || "change",
        date: change.effectiveDate,
        plan: segment.plan,
        previousPlan: planOf(change.from, settings),
        term: first,
        state: segment.replacedBy ? "replaced" : change.effectiveDate > today ? "scheduled" : "started",
        change: {
          id: change.id,
          recordedAt: change.changedAt,
          by: change.changedBy || null,
          note: change.note || "",
          duesCollected: Number(change.duesCollected || 0),
          duesWaived: Number(change.duesWaived || 0),
          duesCarried: Number(change.duesCarried || 0),
          firstTermCollected: Number(change.firstTermCollected || 0),
          duesDetail: change.duesDetail || null,
          replacedBy: segment.replacedBy?.id || "",
        },
      });
    } else {
      if (!member.billingCutover && own[0]) first = own.shift();
      entries.push({
        id: `joined:${member.id}`,
        type: "joined",
        date: member.startDate,
        plan: segment.plan,
        previousPlan: null,
        term: first,
        state: member.startDate > today ? "scheduled" : "started",
        joined: {
          onboardingType: member.onboardingType || "new",
          registeredAt: member.createdAt || "",
          openingBalance: Number(member.openingBalance || 0),
          billingCutover: member.billingCutover || "",
          replacedBy: segment.replacedBy?.id || "",
        },
      });
    }
    for (const term of own) {
      entries.push({
        id: `term:${term.period}`,
        type: "renewed",
        date: term.start,
        plan: segment.plan,
        previousPlan: null,
        term,
        state: term.state === "scheduled" ? "scheduled" : "started",
      });
    }
  });

  const order = { joined: 0, upgrade: 1, downgrade: 1, change: 1, restart: 1, renewed: 2 };
  entries.sort((a, b) => String(a.date).localeCompare(String(b.date)) || order[a.type] - order[b.type]);

  const notes = [];
  if (String(member.createdAt || "").slice(0, 10) < PLAN_LOG_STARTED) notes.push("plan-log-started");
  if (ordered.some((change) => !change.duesDetail && Number(change.duesWaived || 0) + Number(change.duesCollected || 0) > 0)) {
    notes.push("dues-not-itemised");
  }

  return {
    memberId: member.id,
    status: membershipStatus(member, settings),
    plan: planOf(member, settings),
    upcomingChange: member.planStartDate && member.planStartDate > today ? member.planStartDate : "",
    entries,
    notes,
  };
}

module.exports = { PLAN_LOG_STARTED, buildMembershipHistory };
