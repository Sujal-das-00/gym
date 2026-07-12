const { repo } = require("../models");
const { saveImageData } = require("./imageService");

async function updateSettings(gymId, payload) {
  const current = await repo().getSettings(gymId);
  const logo =
    payload.logo && payload.logo !== current.logo ? await saveImageData(payload.logo, "logo") : current.logo || "";
  return repo().saveSettings(gymId, {
    ...current,
    ...payload,
    logo,
  });
}

module.exports = {
  updateSettings,
};
