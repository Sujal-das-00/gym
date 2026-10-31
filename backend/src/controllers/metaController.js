const metaService = require("../services/metaService");

// The phone app reports its anonymous Meta id so purchases can be sent from the server.
async function postDevice(req, res) {
  if (metaService.enabled()) await metaService.saveDevice(req.gymId, req.body?.anonId);
  res.json({ ok: true });
}

module.exports = { postDevice };
