const { createHttpError } = require("../utils/http");
const { memberOutstanding } = require("../utils/billing");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");
const { pushAvailable, sendToSubscriptions } = require("./pushService");

const AUDIENCES = ["all", "pending-fees", "selected"];
const MAX_TITLE = 80;
const MAX_BODY = 300;

function rupees(amount) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0))}`;
}

// The member app is served per gym slug, so every deep link has to carry it.
// `screen` is read by checkin-frontend/src/App.jsx to pick the landing tab.
function memberAppUrl(slug, screen = "home") {
  return `/checkin/${encodeURIComponent(slug)}?screen=${encodeURIComponent(screen)}`;
}

/**
 * A click target the browser will open on OUR origin only. Admin-supplied URLs
 * are otherwise an open redirect with a push notification as the delivery
 * vehicle — "//evil.example" and "https://evil.example" both get rejected here,
 * and anything unusable falls back to the member's own dashboard.
 */
function safeClickUrl(url, fallback) {
  const value = String(url || "").trim();
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function requireText(value, label, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) throw createHttpError(400, `${label} is required`);
  if (text.length > limit) throw createHttpError(400, `${label} must be ${limit} characters or fewer`);
  return text;
}

function assertPushAvailable() {
  if (!pushAvailable()) {
    throw createHttpError(503, "Push notifications are not configured on this server");
  }
}

async function gymContext(gymId) {
  const [gym, settings, members] = await Promise.all([
    gymModel.getGymById(gymId),
    repo().getSettings(gymId),
    repo().getAllMembers(gymId),
  ]);
  if (!gym) throw createHttpError(404, "Gym not found");
  return { gym, settings, members };
}

// Members of THIS gym who owe money today, each with the amount they owe.
// getAllMembers is already tenant-filtered, so no other gym's member can appear.
function membersWithPendingFees(members, settings) {
  return members
    .map((member) => ({ member, outstanding: memberOutstanding(member, settings) }))
    .filter((entry) => entry.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
}

/**
 * Counts for the admin button — how many members owe money and how many of them
 * could actually be reached — without sending anything.
 */
async function feeReminderPreview(gymId) {
  const { settings, members } = await gymContext(gymId);
  const pending = membersWithPendingFees(members, settings);
  const subscriptions = pushAvailable()
    ? await repo().listPushSubscriptionsForMembers(gymId, pending.map((entry) => entry.member.id))
    : [];
  const reachable = new Set(subscriptions.map((subscription) => subscription.memberId));
  return {
    available: pushAvailable(),
    eligibleMembers: pending.length,
    reachableMembers: pending.filter((entry) => reachable.has(entry.member.id)).length,
    totalOutstanding: pending.reduce((sum, entry) => sum + entry.outstanding, 0),
  };
}

/**
 * "🔔 Remind Members with Pending Fees".
 *
 * One personalized notification per member ("Hi Rahul, you have ₹1,500…"), sent
 * to every device that member has registered. Members with no subscription are
 * skipped rather than counted as failures — there is nothing to attempt for them.
 */
async function sendFeeReminders(gymId) {
  assertPushAvailable();
  const { gym, settings, members } = await gymContext(gymId);
  const pending = membersWithPendingFees(members, settings);

  const subscriptions = await repo().listPushSubscriptionsForMembers(
    gymId,
    pending.map((entry) => entry.member.id),
  );
  const byMember = new Map();
  for (const subscription of subscriptions) {
    if (!byMember.has(subscription.memberId)) byMember.set(subscription.memberId, []);
    byMember.get(subscription.memberId).push(subscription);
  }

  const summary = {
    eligibleMembers: pending.length,
    notifiedMembers: 0,
    membersWithoutSubscription: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    expired: 0,
  };

  for (const { member, outstanding } of pending) {
    const devices = byMember.get(member.id) || [];
    if (!devices.length) {
      summary.membersWithoutSubscription += 1;
      continue;
    }
    // One member's push service being down must not stop the rest of the batch.
    const result = await sendToSubscriptions(devices, {
      title: "Fee Payment Reminder",
      body: `Hi ${member.name.split(" ")[0] || member.name}, you have ${rupees(outstanding)} in pending fees. Please clear your dues.`,
      url: memberAppUrl(gym.slug, "home"),
      tag: `fee-reminder-${member.id}`,
      kind: "fee-reminder",
    });
    summary.attempted += result.attempted;
    summary.sent += result.sent;
    summary.failed += result.failed;
    summary.expired += result.expired;
    if (result.sent > 0) summary.notifiedMembers += 1;
  }

  return summary;
}

/**
 * "✉ Send Custom Notification".
 *
 * The recipient list is always rebuilt from THIS gym's members. For the
 * "selected" audience the ids the admin sent are intersected with that list, so
 * a hand-crafted request naming another gym's member ids reaches nobody — and
 * says so, rather than silently pretending it worked.
 */
async function sendCustomNotification(gymId, input = {}) {
  assertPushAvailable();
  const title = requireText(input.title, "Notification title", MAX_TITLE);
  const body = requireText(input.message ?? input.body, "Notification message", MAX_BODY);
  const audience = AUDIENCES.includes(input.audience) ? input.audience : "";
  if (!audience) throw createHttpError(400, "Choose who should receive this notification");

  const { gym, settings, members } = await gymContext(gymId);
  const fallbackUrl = memberAppUrl(gym.slug, "home");
  const url = safeClickUrl(input.url, fallbackUrl);

  let recipients = members;
  if (audience === "pending-fees") {
    recipients = membersWithPendingFees(members, settings).map((entry) => entry.member);
  } else if (audience === "selected") {
    const requested = new Set((Array.isArray(input.memberIds) ? input.memberIds : []).map(String));
    if (!requested.size) throw createHttpError(400, "Select at least one member");
    recipients = members.filter((member) => requested.has(member.id));
    if (!recipients.length) throw createHttpError(400, "None of the selected members belong to this gym");
  }

  const subscriptions = await repo().listPushSubscriptionsForMembers(
    gymId,
    recipients.map((member) => member.id),
  );
  // Members with at least one registered device. Counted before the send, so it
  // reports who could be reached — `sent`/`failed` below report what happened.
  const reachable = new Set(subscriptions.map((subscription) => subscription.memberId));

  const result = await sendToSubscriptions(subscriptions, {
    title,
    body,
    url,
    tag: "gymboo-announcement",
    kind: "custom",
  });

  return {
    audience,
    eligibleMembers: recipients.length,
    reachableMembers: reachable.size,
    membersWithoutSubscription: recipients.length - reachable.size,
    ...result,
  };
}

module.exports = {
  AUDIENCES,
  feeReminderPreview,
  membersWithPendingFees,
  safeClickUrl,
  sendCustomNotification,
  sendFeeReminders,
};
