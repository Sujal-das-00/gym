const attendanceModel = require("./attendanceModel");
const checkinModel = require("./checkinModel");
const expenseModel = require("./expenseModel");
const fallbackModel = require("./fallbackModel");
const memberModel = require("./memberModel");
const paymentModel = require("./paymentModel");
const pushSubscriptionModel = require("./pushSubscriptionModel");
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
    ...expenseModel,
    ...memberModel,
    ...paymentModel,
    // MySQL only — push has no JSON-fallback equivalent; see usingFallback() guards
    // in pushService.js, which turn the notification endpoints off in that mode.
    ...pushSubscriptionModel,
    ...settingsModel,
  };
}

module.exports = {
  repo,
  setModelMode,
  usingFallback,
};
