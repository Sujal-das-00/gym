const { duplicateMemberError } = require("../models/memberModel");

function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(error, req, res, next) {
  if (duplicateMemberError(error)) {
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
