const { repo } = require("../models");
const { saveImageData } = require("./imageService");

async function updateSettings(payload) {
  const current = await repo().getSettings();
  return repo().saveSettings({
    ...current,
    ...payload,
    logo: payload.logo && payload.logo !== current.logo ? saveImageData(payload.logo, "logo") : current.logo || "",
  });
}

module.exports = {
  updateSettings,
};
