const { publicMember } = require("../utils/member");
const { repo } = require("../models");
const { createMember, updateMember } = require("../services/memberService");
const { createExistingMember } = require("../services/onboardingService");
const { notifyPayment } = require("../services/autoNotificationService");
const planChangeService = require("../services/planChangeService");
const {
  findEditablePayment,
  prepareAdmissionEdit,
  prepareAmountEdit,
  prepareDateEdit,
  prepareOtherPayment,
  preparePeriodPayments,
} = require("../services/paymentService");
const { todayKey } = require("../utils/date");
const { memberOutstanding, periodBalance } = require("../utils/billing");
const { changes, paymentLine, planOf, record } = require("../services/auditService");

const sum = (lines) => Math.round(lines.reduce((total, line) => total + Number(line.amount || 0), 0) * 100) / 100;

// The profile fields an edit is logged by (photos as "changed", never the image).
const PROFILE_FIELDS = ["name", "phone", "address", "startDate", "trainerId", "admissionFee"];

async function listMembers(req, res) {
  res.json((await repo().getAllMembers(req.gymId)).map(publicMember));
}

async function postMember(req, res) {
  const body = req.body || {};
  // A member who joined before being entered into GymBoo, with their history.
  if (body.onboarding?.type === "existing") {
    const { member, warnings } = await createExistingMember(req.gymId, body);
    // Past payments are history entered today, not money received today.
    const lines = (member.payments || []).map(paymentLine);
    await record(req.gymId, req.user, "member_added", {
      member,
      details: { existing: true, plan: planOf(member), startDate: member.startDate, lines, historyTotal: sum(lines), openingBalance: Number(member.openingBalance || 0) },
    });
    return res.status(201).json(warnings.length ? { ...member, warnings } : member);
  }
  const member = await createMember(req.gymId, body);
  const lines = (member.payments || []).map(paymentLine);
  await record(req.gymId, req.user, "member_added", {
    member,
    amount: sum(lines),
    details: { existing: false, plan: planOf(member), startDate: member.startDate, lines },
  });
  return res.status(201).json(member);
}

async function putMember(req, res) {
  const before = await repo().getMemberById(req.gymId, req.params.id);
  const saved = await updateMember(req.gymId, req.params.id, req.body || {});
  if (!saved) return res.status(404).json({ error: "Member not found" });
  const changed = changes(before, saved, PROFILE_FIELDS);
  if (before?.photo !== saved.photo) changed.push({ field: "photo", from: before?.photo ? "yes" : "", to: saved.photo ? "yes" : "" });
  if (changed.some((item) => item.field === "trainerId")) {
    const trainers = await repo().getAllTrainers(req.gymId);
    const nameOf = (id) => trainers.find((trainer) => trainer.id === id)?.name || (id ? "Removed trainer" : "No trainer");
    for (const item of changed) if (item.field === "trainerId") Object.assign(item, { field: "trainer", from: nameOf(item.from), to: nameOf(item.to) });
  }
  if (changed.length) await record(req.gymId, req.user, "member_updated", { member: saved, details: { changes: changed } });
  return res.json(saved);
}

async function deleteMember(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  const result = await repo().deleteMember(req.gymId, req.params.id);
  if (!result.affectedRows) return res.status(404).json({ error: "Member not found" });
  if (member) {
    const settings = await repo().getSettings(req.gymId);
    await record(req.gymId, req.user, "member_removed", {
      member,
      details: { plan: planOf(member), owed: memberOutstanding(member, settings) },
    });
  }
  return res.json({ ok: true });
}

async function addPayments(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const payments = preparePeriodPayments(member, Array.isArray(req.body.payments) ? req.body.payments : []);
  await repo().addPayments(member, payments);
  notifyPayment(req.gymId, member, payments);
  const saved = publicMember(await repo().getMemberById(req.gymId, member.id));
  const lines = payments.map((payment) => paymentLine({ ...payment, kind: payment.kind || "membership", date: payment.date || todayKey() }));
  const periods = [...new Set(lines.filter((line) => line.kind === "membership").map((line) => line.period))];
  await record(req.gymId, req.user, "payment", {
    member: saved,
    amount: sum(lines),
    details: {
      lines,
      mode: lines[0]?.mode || "",
      part: lines.some((line) => line.kind === "membership" && line.periodFee !== null && line.amount < line.periodFee),
      // Still owed on the terms this paid, right after it (0 = settled).
      dueAfter: Math.round(periods.reduce((total, period) => total + periodBalance(saved, period), 0) * 100) / 100,
    },
  });
  return res.json(saved);
}

// Extra money taken from a member while their fees are up to date (supplements,
// a part payment, ...). Needs a note; pays no term, so what the member owes
// never changes.
async function postOtherPayment(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const payment = prepareOtherPayment(req.body, todayKey());
  await repo().addOtherPayment(member, payment);
  notifyPayment(req.gymId, member, [payment]);
  await record(req.gymId, req.user, "purchase", {
    member,
    amount: payment.amount,
    details: { lines: [paymentLine({ ...payment, kind: "other", billingPeriod: "other" })], mode: payment.mode },
  });
  return res.status(201).json(publicMember(await repo().getMemberById(req.gymId, member.id)));
}

// Correct the amount of one recorded payment. Less than the term's fee leaves
// the rest due, like any part payment.
async function putPayment(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const target = (member.payments || []).find((payment) => payment.id === req.params.paymentId);
  if (target?.kind === "admission") {
    const admission = prepareAdmissionEdit(member, target.id, req.body?.amount);
    await repo().updateAdmissionAmount(member, admission.payment.id, admission.amount);
    await record(req.gymId, req.user, "payment_edited", {
      member,
      amount: admission.amount,
      details: { line: paymentLine(target), from: target.amount, to: admission.amount },
    });
    return res.json(publicMember(await repo().getMemberById(req.gymId, member.id)));
  }
  const settings = await repo().getSettings(req.gymId);
  const edit = prepareAmountEdit(member, req.params.paymentId, req.body?.amount, settings);
  await repo().updatePaymentAmount(member, edit.payment.id, edit.period, edit.amount, edit.periodFee);
  const saved = publicMember(await repo().getMemberById(req.gymId, member.id));
  await record(req.gymId, req.user, "payment_edited", {
    member,
    amount: edit.amount,
    details: { line: paymentLine(edit.payment), from: edit.payment.amount, to: edit.amount, dueAfter: periodBalance(saved, edit.period) },
  });
  return res.json(saved);
}

// Set or correct the day a payment was collected. Only the date changes: the
// amount and the term it pays are untouched.
async function putPaymentDate(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const edit = prepareDateEdit(member, req.params.paymentId, req.body?.date, todayKey());
  await repo().updatePaymentDate(member, edit.payment.id, edit.date);
  await record(req.gymId, req.user, "payment_date_changed", {
    member,
    details: {
      line: paymentLine(edit.payment),
      from: edit.payment.dateKnown === false ? "" : String(edit.payment.date || "").slice(0, 10),
      to: edit.date,
    },
  });
  return res.json(publicMember(await repo().getMemberById(req.gymId, member.id)));
}

// Delete one recorded payment. Its term goes back to unpaid, so it shows as
// overdue if it is already due.
async function deletePayment(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const settings = await repo().getSettings(req.gymId);
  const { payment } = findEditablePayment(member, req.params.paymentId, settings);
  await repo().deletePayment(member, payment.id);
  await record(req.gymId, req.user, "payment_deleted", { member, amount: payment.amount, details: { line: paymentLine(payment) } });
  return res.json(publicMember(await repo().getMemberById(req.gymId, member.id)));
}

// Change a member's plan from a chosen date; logged with who and when.
async function postPlanChange(req, res) {
  const result = await planChangeService.changeMemberPlan(req.gymId, req.params.id, req.body || {}, req.user);
  if (result.payments.length) notifyPayment(req.gymId, result.member, result.payments);
  const { change } = result;
  await record(req.gymId, req.user, "plan_changed", {
    member: result.member,
    amount: sum(result.payments),
    details: {
      from: change.from,
      to: change.to,
      effectiveDate: change.effectiveDate,
      duesCollected: change.duesCollected,
      waived: change.duesWaived,
      firstTermCollected: change.firstTermCollected,
      mode: result.payments[0]?.mode || "",
      note: change.note,
    },
  });
  return res.json({ member: result.member, change });
}

async function listPlanChanges(req, res) {
  res.json(await planChangeService.listPlanChanges(req.gymId, { memberId: req.query.memberId }));
}

module.exports = {
  addPayments,
  deletePayment,
  postOtherPayment,
  putPayment,
  putPaymentDate,
  listPlanChanges,
  postPlanChange,
  deleteMember,
  listMembers,
  postMember,
  putMember,
};
