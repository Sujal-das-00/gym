const { repo } = require("../models");
const { saveImageData } = require("./imageService");

async function updateSettings(gymId, payload) {
  const current = await repo().getSettings(gymId);
  return repo().saveSettings(gymId, {
    ...current,
    ...payload,
    logo: payload.logo && payload.logo !== current.logo ? saveImageData(payload.logo, "logo") : current.logo || "",
  });
}

module.exports = {
  updateSettings,
};
