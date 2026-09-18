const { createHttpError } = require("../utils/http");
const { dueUnpaidPeriods, memberOutstanding } = require("../utils/billing");
const { repo } = require("../models");
const gymModel = require("../models/gymModel");
const { pushAvailable, pushDisabledReason, sendToSubscriptions } = require("./pushService");

const AUDIENCES = ["all", "pending-fees", "selected"];
const MAX_TITLE = 80;
const MAX_BODY = 300;

function rupees(amount) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0))}`;
}

function firstName(member) {
  const name = String(member?.name || "").trim();
  return name.split(" ")[0] || name || "there";
}

/**
 * What the member is behind on, in words.
 *
 * A gym that has not set a monthly fee still has overdue members — their
 * outstanding is 0 rupees, and quoting "₹0 in pending fees" at them reads as a
 * bug. Count the periods instead whenever there is no amount to name.
 */
function dueText(outstanding, unpaidPeriods) {
  if (outstanding > 0) return `you have ${rupees(outstanding)} in pending fees`;
  const count = Math.max(1, Number(unpaidPeriods) || 1);
  return `your membership has ${count} unpaid ${count === 1 ? "period" : "periods"}`;
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

/**
 * Members of THIS gym who are behind on payment today, each with the number of
 * billing periods they have not paid and the rupees that adds up to.
 * getAllMembers is already tenant-filtered, so no other gym's member can appear.
 *
 * The test is the COUNT of due unpaid periods, not the rupee total — the same
 * test as isOverdue() in admin-frontend/src/lib/billing.js, which is what puts
 * the "Overdue" badge on a member everywhere else in the panel. Filtering on
 * `outstanding > 0` instead used to drop every member whose monthly fee is 0
 * (the column's default, and what a gym that hasn't set a fee yet has on every
 * row): they showed as overdue on the dashboard, in Members and in Payments,
 * and in their own member app — but were invisible to the one screen that
 * exists to chase them.
 */
function membersWithPendingFees(members, settings) {
  return members
    .map((member) => ({
      member,
      outstanding: memberOutstanding(member, settings),
      unpaidPeriods: dueUnpaidPeriods(member, settings).length,
    }))
    .filter((entry) => entry.unpaidPeriods > 0)
    .sort((a, b) => b.outstanding - a.outstanding || b.unpaidPeriods - a.unpaidPeriods);
}

// Long enough to act on, short enough that a 500-member gym doesn't ship its
// whole defaulter list on every page load.
const PREVIEW_LIST_LIMIT = 50;

/**
 * Counts for the admin button — how many members are behind on payment and how
 * many of them could actually be reached — without sending anything.
 *
 * Also names them, twice over. "0 reminders sent" with 12 members overdue is
 * baffling on its own, and so is the opposite pair of facts the owner hits
 * first: an announcement to "All members" lands on a phone, but the fee
 * reminder reports nobody to remind. Both have the same one cause — the
 * devices that are registered belong to members who do NOT owe anything — and
 * neither the overdue list nor a count can show that. So the gym's whole
 * notification roster is returned alongside it: who has the app switched on,
 * and how many devices each of them has.
 */
async function feeReminderPreview(gymId) {
  const { settings, members } = await gymContext(gymId);
  const pending = membersWithPendingFees(members, settings);
  // Every member, not just the overdue ones: the roster below is the whole
  // point, and one query answers both halves.
  const subscriptions = pushAvailable()
    ? await repo().listPushSubscriptionsForMembers(gymId, members.map((member) => member.id))
    : [];

  const deviceCount = new Map();
  for (const subscription of subscriptions) {
    deviceCount.set(subscription.memberId, (deviceCount.get(subscription.memberId) || 0) + 1);
  }
  const overdueIds = new Set(pending.map((entry) => entry.member.id));

  const list = pending.slice(0, PREVIEW_LIST_LIMIT).map((entry) => ({
    id: entry.member.id,
    name: entry.member.name,
    phone: entry.member.phone,
    outstanding: entry.outstanding,
    unpaidPeriods: entry.unpaidPeriods,
    devices: deviceCount.get(entry.member.id) || 0,
  }));

  // Who has notifications on, most devices first — the answer to "then who DID
  // my announcement reach?". Overdue is flagged so the two lists line up.
  const subscribed = members
    .filter((member) => deviceCount.has(member.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      phone: member.phone,
      devices: deviceCount.get(member.id) || 0,
      overdue: overdueIds.has(member.id),
    }))
    .sort((a, b) => b.devices - a.devices || a.name.localeCompare(b.name))
    .slice(0, PREVIEW_LIST_LIMIT);

  return {
    available: pushAvailable(),
    // "missing" | "invalid" | "" — lets the panel name the actual problem.
    disabledReason: pushAvailable() ? "" : pushDisabledReason(),
    eligibleMembers: pending.length,
    reachableMembers: pending.filter((entry) => deviceCount.has(entry.member.id)).length,
    totalOutstanding: pending.reduce((sum, entry) => sum + entry.outstanding, 0),
    totalMembers: members.length,
    // Gym-wide, across everyone — what an announcement to "All members" reaches.
    subscribedMembers: deviceCount.size,
    registeredDevices: subscriptions.length,
    // Both capped; the counts above remain the true totals.
    pending: list,
    subscribed,
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

  for (const { member, outstanding, unpaidPeriods } of pending) {
    const devices = byMember.get(member.id) || [];
    if (!devices.length) {
      summary.membersWithoutSubscription += 1;
      continue;
    }
    // One member's push service being down must not stop the rest of the batch.
    const result = await sendToSubscriptions(devices, {
      title: "Fee Payment Reminder",
      body: `Hi ${firstName(member)}, ${dueText(outstanding, unpaidPeriods)}. Please clear your dues.`,
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
