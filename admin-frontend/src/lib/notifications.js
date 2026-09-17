import { api, jsonRequest } from "./api.js";

/**
 * Push notifications the gym owner sends to their members. Every call goes
 * through api(), so it carries the session and — for a super-admin — the
 * x-gym-id of the gym they have selected. The backend derives the recipient
 * list from that gym alone; nothing here can widen it.
 */

// Counts for the button label: how many members owe money, and how many of them
// have a device registered. Sends nothing.
export const fetchPendingFeeSummary = () => api("/api/notifications/pending-fees");

export const sendFeeReminders = () => api("/api/notifications/fee-reminders", { method: "POST" });

export const sendCustomNotification = ({ title, message, audience, memberIds, url }) =>
  api(
    "/api/notifications/custom",
    jsonRequest("POST", { title, message, audience, memberIds, url }),
  );
