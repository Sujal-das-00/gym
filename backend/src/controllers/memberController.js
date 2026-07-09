const { publicMember } = require("../utils/member");
const { repo } = require("../models");
const { createMember, updateMember } = require("../services/memberService");

async function listMembers(req, res) {
  res.json((await repo().getAllMembers()).map(publicMember));
}

async function postMember(req, res) {
  res.status(201).json(await createMember(req.body || {}));
}

async function putMember(req, res) {
  const saved = await updateMember(req.params.id, req.body || {});
  if (!saved) return res.status(404).json({ error: "Member not found" });
  return res.json(saved);
}

async function deleteMember(req, res) {
  const result = await repo().deleteMember(req.params.id);
  if (!result.affectedRows) return res.status(404).json({ error: "Member not found" });
  return res.json({ ok: true });
}

async function addPayments(req, res) {
  const member = await repo().getMemberById(req.params.id);
  if (!member) return res.status(404).json({ error: "Member not found" });
  const payments = Array.isArray(req.body.payments) ? req.body.payments : [];
  await repo().addPayments(member, payments);
  return res.json(publicMember(await repo().getMemberById(member.id)));
}

module.exports = {
  addPayments,
  deleteMember,
  listMembers,
  postMember,
  putMember,
};
