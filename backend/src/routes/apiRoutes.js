const express = require("express");
const appController = require("../controllers/appController");
const attendanceController = require("../controllers/attendanceController");
const authController = require("../controllers/authController");
const checkinController = require("../controllers/checkinController");
const expenseController = require("../controllers/expenseController");
const memberController = require("../controllers/memberController");
const publicController = require("../controllers/publicController");
const pushController = require("../controllers/pushController");
const settingsController = require("../controllers/settingsController");
const superRoutes = require("./superRoutes");
const { authenticate, requireRole, resolveTenant } = require("../middleware/auth");
const { authenticateMember } = require("../middleware/memberAuth");
const { checkinThrottle } = require("../middleware/checkinThrottle");
const { memberLoginThrottle } = require("../middleware/memberLoginThrottle");
const { notifyThrottle } = require("../middleware/notifyThrottle");
const { asyncHandler } = require("../utils/http");

const router = express.Router();

// --- Authentication (no login required) ---
router.post("/auth/login", asyncHandler(authController.postLogin));
router.post("/auth/logout", asyncHandler(authController.postLogout));
router.get("/auth/me", authenticate, asyncHandler(authController.getMe));

// QR image of a check-in URL. Loaded as an <img> (can't send auth/tenant headers)
// and only renders the URL it is given, so it stays outside the auth wall.
router.get("/qr", appController.getQr);

// --- Public, gym-scoped member check-in (no login; the slug picks the gym) ---
router.get("/public/:slug/settings", asyncHandler(publicController.getPublicSettings));
router.post("/public/:slug/checkin", checkinThrottle, asyncHandler(publicController.postPublicCheckin));
router.get("/public/:slug/checkin/history", asyncHandler(publicController.getPublicCheckinHistory));

// --- Member "Account" login: gym_id (username) + phone (password) ---
router.post("/public/:slug/account/login", memberLoginThrottle, asyncHandler(publicController.postAccountLogin));
router.post("/public/:slug/account/logout", asyncHandler(publicController.postAccountLogout));
router.get("/public/:slug/account/session", authenticateMember, asyncHandler(publicController.getAccountSession));

// --- Web Push: member device registration ---
// The VAPID public key is not a secret (the browser encrypts to it), so the
// service worker can fetch it before the member has signed in.
router.get("/push/public-key", asyncHandler(pushController.getPublicKey));
// Registering a device requires a member session: a subscription is only useful
// once it is tied to a member, and only that member may create or revoke it.
router.post("/public/:slug/account/push/subscribe", authenticateMember, asyncHandler(pushController.postSubscribe));
router.post("/public/:slug/account/push/unsubscribe", authenticateMember, asyncHandler(pushController.deleteSubscribe));
router.get("/public/:slug/account/push/devices", authenticateMember, asyncHandler(pushController.getMySubscriptions));

// --- Super-admin panel (env-based login, own cookie, fully isolated) ---
router.use("/super", superRoutes);

// --- Everything below requires a login and is scoped to a single gym ---
router.use(authenticate, resolveTenant);

router.get("/config", asyncHandler(appController.getConfig));

// Staff accounts — gym admins manage their own gym's staff.
router.get("/staff", requireRole("gym_admin"), asyncHandler(authController.listStaff));
router.post("/staff", requireRole("gym_admin"), asyncHandler(authController.postStaff));

router.get("/settings", asyncHandler(settingsController.getSettings));
router.put("/settings", asyncHandler(settingsController.putSettings));

router.get("/members", asyncHandler(memberController.listMembers));
router.post("/members", asyncHandler(memberController.postMember));
router.put("/members/:id", asyncHandler(memberController.putMember));
router.delete("/members/:id", asyncHandler(memberController.deleteMember));
router.post("/members/:id/payments", asyncHandler(memberController.addPayments));

router.get("/expenses", asyncHandler(expenseController.listExpenses));
router.post("/expenses", asyncHandler(expenseController.postExpense));
router.put("/expenses/:id", asyncHandler(expenseController.putExpense));
router.delete("/expenses/:id", asyncHandler(expenseController.deleteExpense));

router.post("/attendance", asyncHandler(attendanceController.setAttendance));
router.get("/attendance/status", asyncHandler(attendanceController.getAttendanceStatus));

// --- Push notifications the gym owner sends out ---
// Owner-only: `staff` can collect fees but cannot message the whole membership.
// notifyThrottle caps how often the two sending endpoints can be fired.
router.get("/notifications/pending-fees", requireRole("gym_admin", "super_admin"), asyncHandler(pushController.getFeeReminderPreview));
router.post("/notifications/fee-reminders", requireRole("gym_admin", "super_admin"), notifyThrottle, asyncHandler(pushController.postFeeReminders));
router.post("/notifications/custom", requireRole("gym_admin", "super_admin"), notifyThrottle, asyncHandler(pushController.postCustomNotification));

router.get("/checkins", asyncHandler(checkinController.listCheckins));
router.get("/checkin/today", asyncHandler(checkinController.getTodayCode));

module.exports = router;
