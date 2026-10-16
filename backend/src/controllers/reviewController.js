const crypto = require("crypto");
const { exec } = require("../config/database");
const { createHttpError } = require("../utils/http");

const clean = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

// Public "Give a review" form. Saved as pending; nothing is published from here.
async function postReview(req, res) {
  const body = req.body || {};
  // Hidden field a person never fills in: pretend success so bots learn nothing.
  if (body.website) return res.status(201).json({ ok: true });

  const name = clean(body.name, 80);
  const gymName = clean(body.gymName, 120);
  const message = String(body.message || "").trim().slice(0, 800);

  if (!name) throw createHttpError(400, "Please enter your name.");
  if (!gymName) throw createHttpError(400, "Please enter your gym's name.");
  if (message.length < 20) throw createHttpError(400, "Please write at least a couple of sentences.");

  await exec("INSERT INTO site_reviews (id, name, gym_name, message) VALUES (?, ?, ?, ?)", [
    crypto.randomUUID(),
    name,
    gymName,
    message,
  ]);
  return res.status(201).json({ ok: true });
}

module.exports = { postReview };
