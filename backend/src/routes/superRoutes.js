const express = require("express");
const superAdminController = require("../controllers/superAdminController");
const { authenticateSuper } = require("../middleware/superAuth");
const { asyncHandler } = require("../utils/http");

// Mounted at /api/super. Fully isolated from the gym-admin API: its own cookie,
// its own auth guard, env-based credentials. Gym admins/staff cannot reach it.
const router = express.Router();

router.post("/login", asyncHandler(superAdminController.postLogin));
router.post("/logout", asyncHandler(superAdminController.postLogout));

router.use(authenticateSuper);

router.get("/me", asyncHandler(superAdminController.getMe));

router.get("/gyms", asyncHandler(superAdminController.listGyms));
router.post("/gyms", asyncHandler(superAdminController.postGym));
router.patch("/gyms/:id/status", asyncHandler(superAdminController.setGymStatus));

router.get("/admins", asyncHandler(superAdminController.listAdmins));
router.post("/admins", asyncHandler(superAdminController.postAdmin));
router.patch("/admins/:id/status", asyncHandler(superAdminController.setAdminStatus));

module.exports = router;
