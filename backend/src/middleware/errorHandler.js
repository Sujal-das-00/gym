const { duplicateMemberError } = require("../models/memberModel");

function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(error, req, res, next) {
  // A repeated payment request id is answered with the first result by the
  // payment service; one still colliding here is a different conflict.
  if (duplicateMemberError(error) && /payment_transactions|uniq_payment_transactions_request/.test(error.message || "")) {
    error.status = 409;
    error.message = "This payment was already recorded. Reload to see the latest.";
  } else if (duplicateMemberError(error) && /uniq_plan_changes_request/.test(error.message || "")) {
    // Same for a repeated Change plan request (planChangeService answers it first).
    error.status = 409;
    error.message = "This plan change was already saved. Reload to see the latest.";
  } else if (duplicateMemberError(error)) {
    error.status = 409;
    error.message = "Member with this Gym ID or phone already exists";
  }
  const status = error.status || 500;
  res.status(status).json({ error: error.message || "Server error" });
}

module.exports = {
  errorHandler,
  notFound,
};
