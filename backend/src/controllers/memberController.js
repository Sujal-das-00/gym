const { publicMember } = require("../utils/member");
const { repo } = require("../models");
const { createMember, updateMember } = require("../services/memberService");
const { createExistingMember } = require("../services/onboardingService");
const { notifyPayment } = require("../services/autoNotificationService");
const planChangeService = require("../services/planChangeService");
const paymentService = require("../services/paymentService");

async function listMembers(req, res) {
  res.json((await repo().getAllMembers(req.gymId)).map(publicMember));
}

async function postMember(req, res) {
  const body = req.body || {};
  // A member who joined before being entered into GymBoo, with their history.
  if (body.onboarding?.type === "existing") {
    const { member, warnings } = await createExistingMember(req.gymId, body, req.user);
    return res.status(201).json(warnings.length ? { ...member, warnings } : member);
  }
  return res.status(201).json(await createMember(req.gymId, body, req.user));
}

async function putMember(req, res) {
  const saved = await updateMember(req.gymId, req.params.id, req.body || {});
  if (!saved) return res.status(404).json({ error: "Member not found" });
  return res.json(saved);
}

async function deleteMember(req, res) {
  const result = await repo().deleteMember(req.gymId, req.params.id);
  if (!result.affectedRows) return res.status(404).json({ error: "Member not found" });
  return res.json({ ok: true });
}

// Records money received. The older body ({ payments: [...] }) still gets the
// member back, as it always did; the Record payment sheet also gets the
// transaction it created.
async function addPayments(req, res) {
  const body = req.body || {};
  const { member, transaction, repeated } = await paymentService.recordPayment(req.gymId, req.params.id, body, req.user);
  if (!repeated && transaction) notifyPayment(req.gymId, member, [{ amount: transaction.amount }]);
  if (Array.isArray(body.payments)) return res.json(member);
  return res.status(repeated ? 200 : 201).json({ member, transaction, repeated });
}

// Method, reference or note, edited in place with an audit trail (owners only).
async function patchPayment(req, res) {
  res.json(await paymentService.editPaymentDetails(req.gymId, req.params.id, req.params.transactionId, req.body || {}, req.user));
}

// Amount, date or allocation: reversed and replaced in one go (owners only).
async function postPaymentCorrection(req, res) {
  res.json(await paymentService.correctPayment(req.gymId, req.params.id, req.params.transactionId, req.body || {}, req.user));
}

async function postPaymentReversal(req, res) {
  res.json(await paymentService.reversePayment(req.gymId, req.params.id, req.params.transactionId, req.body || {}, req.user));
}

async function listPaymentCorrections(req, res) {
  const member = await repo().getMemberById(req.gymId, req.params.id);
  if (!member || !member.transactions.some((tx) => tx.id === req.params.transactionId)) {
    return res.status(404).json({ error: "Payment not found" });
  }
  return res.json(await repo().listCorrections(req.gymId, req.params.transactionId));
}

// Change a member's plan from a chosen date; logged with who and when.
async function postPlanChange(req, res) {
  const result = await planChangeService.changeMemberPlan(req.gymId, req.params.id, req.body || {}, req.user);
  if (result.payments.length) notifyPayment(req.gymId, result.member, result.payments);
  return res.json({ member: result.member, change: result.change });
}

async function listPlanChanges(req, res) {
  res.json(await planChangeService.listPlanChanges(req.gymId, { memberId: req.query.memberId }));
}

module.exports = {
  addPayments,
  listPaymentCorrections,
  patchPayment,
  postPaymentCorrection,
  postPaymentReversal,
  listPlanChanges,
  postPlanChange,
  deleteMember,
  listMembers,
  postMember,
  putMember,
};
