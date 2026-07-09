const attendanceModel = require("./attendanceModel");
const checkinModel = require("./checkinModel");
const fallbackModel = require("./fallbackModel");
const memberModel = require("./memberModel");
const paymentModel = require("./paymentModel");
const settingsModel = require("./settingsModel");

let mode = "mysql";

function setModelMode(nextMode) {
  mode = nextMode === "json" ? "json" : "mysql";
}

function usingFallback() {
  return mode === "json";
}

function repo() {
  if (usingFallback()) return fallbackModel;
  return {
    ...attendanceModel,
    ...checkinModel,
    ...memberModel,
    ...paymentModel,
    ...settingsModel,
  };
}

module.exports = {
  repo,
  setModelMode,
  usingFallback,
};
