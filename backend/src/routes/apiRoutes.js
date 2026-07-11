const express = require("express");
const appController = require("../controllers/appController");
const attendanceController = require("../controllers/attendanceController");
const authController = require("../controllers/authController");
const checkinController = require("../controllers/checkinController");
const memberController = require("../controllers/memberController");
const publicController = require("../controllers/publicController");
const settingsController = require("../controllers/settingsController");
const superRoutes = require("./superRoutes");
const { authenticate, requireRole, resolveTenant } = require("../middleware/auth");
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
router.post("/public/:slug/checkin", asyncHandler(publicController.postPublicCheckin));
router.get("/public/:slug/checkin/history", asyncHandler(publicController.getPublicCheckinHistory));

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

router.post("/attendance", asyncHandler(attendanceController.setAttendance));
router.get("/attendance/status", asyncHandler(attendanceController.getAttendanceStatus));

router.get("/checkins", asyncHandler(checkinController.listCheckins));

module.exports = router;
