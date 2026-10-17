const { repo } = require("../models");
const gymModel = require("../models/gymModel");
const platformSettings = require("../models/platformSettingsModel");
const { autoNotifyConfig } = require("../config/env");
const { memberBillingSummary } = require("../utils/billing");
const { pushAvailable, sendToSubscriptions } = require("./pushService");
const { firstName, memberAppUrl, rupees, sendFeeReminders } = require("./notificationService");

/*
 * Automatic notifications.
 *
 *   Event-driven (sent the moment it happens): check-in confirmation, payment
 *   received, welcome (first time a member's phone registers).
 *   Scheduled (once a day at AUTO_NOTIFY_HOUR): pending-fee reminders and
 *   "membership renews soon".
 *
 * Every function here swallows its own errors: a push problem must never make a
 * check-in, a payment entry or a sign-up fail.
 */

function enabled() {
  return autoNotifyConfig().enabled && pushAvailable();
}

async function sendToMember(gymId, memberId, payload) {
  const subscriptions = await repo().listPushSubscriptionsForMembers(gymId, [memberId]);
  if (!subscriptions.length) return null;
  return sendToSubscriptions(subscriptions, payload);
}

// Wraps one event so it can be fired without await and never rejects.
function safely(label, task) {
  return Promise.resolve()
    .then(task)
    .catch((error) => console.warn(`Auto notification (${label}) failed: ${error.message}`));
}

/* ---- Event-driven --------------------------------------------------------- */

function notifyCheckin(gymId, member) {
  if (!enabled()) return Promise.resolve();
  return safely("check-in", async () => {
    const gym = await gymModel.getGymById(gymId);
    await sendToMember(gymId, member.id, {
      title: "Checked in ✅",
      body: `Hi ${firstName(member)}, you're checked in${gym?.name ? ` at ${gym.name}` : ""}. Have a great workout!`,
      url: memberAppUrl(gym?.slug || "", "home"),
      tag: `checkin-${member.id}`,
      kind: "checkin",
    });
  });
}

function notifyPayment(gymId, member, payments) {
  if (!enabled()) return Promise.resolve();
  const total = (payments || []).reduce((sum, payment) => sum + (Number(payment?.amount) || 0), 0);
  if (!(total > 0)) return Promise.resolve();
  return safely("payment", async () => {
    const gym = await gymModel.getGymById(gymId);
    await sendToMember(gymId, member.id, {
      title: "Payment received 🧾",
      body: `Hi ${firstName(member)}, we received your payment of ${rupees(total)}. Thank you!`,
      url: memberAppUrl(gym?.slug || "", "receipts"),
      tag: `payment-${Date.now()}`,
      kind: "payment",
    });
  });
}

// Only the member's FIRST registered device earns a welcome, and only once ever
// (remembered per member) — turning notifications off and on again, or a second
// phone, must not repeat it.
function notifyWelcome(gymId, member) {
  if (!enabled()) return Promise.resolve();
  return safely("welcome", async () => {
    const key = `welcome:${member.id}`;
    if (await platformSettings.get(key)) return;
    await platformSettings.set(key, new Date().toISOString());
    const gym = await gymModel.getGymById(gymId);
    await sendToMember(gymId, member.id, {
      title: `Welcome to ${gym?.name || "Gym Boo"} 💪`,
      body: `Hi ${firstName(member)}, notifications are on. We'll remind you about fees and renewals here.`,
      url: memberAppUrl(gym?.slug || "", "home"),
      tag: "welcome",
      kind: "welcome",
    });
  });
}

/* ---- Scheduled ------------------------------------------------------------ */

function daysText(days) {
  return days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
}

/**
 * "Your membership renews in 3 days" for members who are NOT yet overdue. Overdue
 * members are the fee reminder's job, so nobody gets both messages on one morning.
 */
async function sendExpiringSoon(gymId) {
  const { expiringDays } = autoNotifyConfig();
  const gym = await gymModel.getGymById(gymId);
  const settings = await repo().getSettings(gymId);
  const members = await repo().getAllMembers(gymId);

  const due = [];
  for (const member of members) {
    const billing = memberBillingSummary(member, settings);
    if (billing.expired || !billing.nextDueDate) continue;
    if (!expiringDays.includes(billing.daysLeft)) continue;
    due.push({ member, billing });
  }
  if (!due.length) return { eligible: 0, sent: 0 };

  const subscriptions = await repo().listPushSubscriptionsForMembers(gymId, due.map((entry) => entry.member.id));
  const byMember = new Map();
  for (const subscription of subscriptions) {
    if (!byMember.has(subscription.memberId)) byMember.set(subscription.memberId, []);
    byMember.get(subscription.memberId).push(subscription);
  }

  let sent = 0;
  for (const { member, billing } of due) {
    const devices = byMember.get(member.id);
    if (!devices?.length) continue;
    const amount = billing.amount > 0 ? ` (${rupees(billing.amount)})` : "";
    const result = await sendToSubscriptions(devices, {
      title: "Membership renews soon ⏰",
      body: `Hi ${firstName(member)}, your membership renews ${daysText(billing.daysLeft)} on ${billing.nextDueDate}${amount}. Please pay on time.`,
      url: memberAppUrl(gym?.slug || "", "home"),
      tag: `expiring-${member.id}`,
      kind: "expiring",
    });
    sent += result.sent;
  }
  return { eligible: due.length, sent };
}

/** One full pass over every active gym. Safe to call by hand (see scripts/). */
async function runDailyNotifications() {
  if (!enabled()) return { skipped: true };
  const gyms = (await gymModel.listGyms()).filter((gym) => gym.status === "active");
  const results = [];
  for (const gym of gyms) {
    // One gym failing (bad data, push outage) must not skip the gyms after it.
    try {
      const fees = await sendFeeReminders(gym.id);
      const expiring = await sendExpiringSoon(gym.id);
      results.push({ gym: gym.slug, fees, expiring });
    } catch (error) {
      console.warn(`Daily notifications failed for ${gym.slug}: ${error.message}`);
      results.push({ gym: gym.slug, error: error.message });
    }
  }
  return { skipped: false, results };
}

/* ---- Scheduler ------------------------------------------------------------ */

// Wall-clock date and minutes-since-midnight in the configured time zone, so the
// 10 AM trigger is 10 AM for the gym, not for wherever the server happens to be.
function zonedNow(timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const LAST_RUN_KEY = "auto_notify_last_run";
// If the server was down at the trigger time it still catches up, but not so late
// that a 9 PM restart sends "good morning, you owe fees" at night.
const CATCH_UP_MINUTES = 6 * 60;

/**
 * Runs today's pass at most once, no matter who asks: the in-process timer, an
 * external cron job (shared hosting puts idle Node apps to sleep, so a timer
 * alone can miss 10 AM) or a second server instance. `force` skips the
 * once-a-day guard, for manual testing only.
 */
async function runClaimedDaily({ force = false } = {}) {
  const { timeZone } = autoNotifyConfig();
  const today = zonedNow(timeZone).date;
  if (!force) {
    if ((await platformSettings.get(LAST_RUN_KEY)) === today) return { skipped: true, reason: "already ran today" };
    // Claim today BEFORE sending so a restart mid-run can't repeat it.
    await platformSettings.set(LAST_RUN_KEY, today);
  }
  return runDailyNotifications();
}

async function tick() {
  const { hour, timeZone } = autoNotifyConfig();
  if (!enabled()) return;
  const now = zonedNow(timeZone);
  const start = hour * 60;
  if (now.minutes < start || now.minutes >= start + CATCH_UP_MINUTES) return;
  const outcome = await runClaimedDaily();
  if (!outcome.skipped) console.log(`Daily notifications (${now.date}): ${JSON.stringify(outcome)}`);
}

function startScheduler() {
  const { enabled: on, hour, timeZone } = autoNotifyConfig();
  if (!on) {
    console.log("Automatic notifications are off (AUTO_NOTIFICATIONS=false).");
    return null;
  }
  console.log(`Automatic notifications: daily at ${String(hour).padStart(2, "0")}:00 ${timeZone}`);
  const timer = setInterval(() => {
    tick().catch((error) => console.warn(`Notification scheduler error: ${error.message}`));
  }, 60 * 1000);
  timer.unref();
  return timer;
}

module.exports = {
  notifyCheckin,
  notifyPayment,
  notifyWelcome,
  runClaimedDaily,
  runDailyNotifications,
  sendExpiringSoon,
  startScheduler,
};
