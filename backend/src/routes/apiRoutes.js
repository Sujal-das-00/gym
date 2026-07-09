const express = require("express");
const appController = require("../controllers/appController");
const attendanceController = require("../controllers/attendanceController");
const checkinController = require("../controllers/checkinController");
const memberController = require("../controllers/memberController");
const settingsController = require("../controllers/settingsController");
const { asyncHandler } = require("../utils/http");

const router = express.Router();

router.get("/config", appController.getConfig);
router.get("/qr", appController.getQr);

router.get("/settings", asyncHandler(settingsController.getSettings));
router.put("/settings", asyncHandler(settingsController.putSettings));

router.get("/members", asyncHandler(memberController.listMembers));
router.post("/members", asyncHandler(memberController.postMember));
router.put("/members/:id", asyncHandler(memberController.putMember));
router.delete("/members/:id", asyncHandler(memberController.deleteMember));
router.post("/members/:id/payments", asyncHandler(memberController.addPayments));

router.post("/attendance", asyncHandler(attendanceController.setAttendance));
router.get("/attendance/status", asyncHandler(attendanceController.getAttendanceStatus));

router.post("/checkin", asyncHandler(checkinController.postCheckin));
router.get("/checkin/history", asyncHandler(checkinController.getCheckinHistory));
router.get("/checkins", asyncHandler(checkinController.listCheckins));

module.exports = router;
