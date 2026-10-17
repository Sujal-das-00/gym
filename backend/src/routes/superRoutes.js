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

router.get("/settings", asyncHandler(superAdminController.getSettings));
router.put("/settings", asyncHandler(superAdminController.putSettings));
router.put("/settings/maintenance", asyncHandler(superAdminController.putMaintenanceSettings));
router.get("/overview", asyncHandler(superAdminController.getOverview));
router.get("/reviews", asyncHandler(superAdminController.listReviews));
router.patch("/reviews/:id", asyncHandler(superAdminController.setReviewStatus));
router.delete("/reviews/:id", asyncHandler(superAdminController.deleteReview));

router.get("/gyms", asyncHandler(superAdminController.listGyms));
router.post("/gyms", asyncHandler(superAdminController.postGym));
router.patch("/gyms/:id", asyncHandler(superAdminController.patchGym));
router.get("/gyms/:id/maintenance", asyncHandler(superAdminController.getMaintenance));
router.post("/gyms/:id/maintenance", asyncHandler(superAdminController.postMaintenance));
router.patch("/gyms/:id/status", asyncHandler(superAdminController.setGymStatus));

router.get("/partners", asyncHandler(superAdminController.listPartners));
router.get("/purchases", asyncHandler(superAdminController.listPurchases));
router.post("/purchases", asyncHandler(superAdminController.postPurchase));
router.post("/purchases/:id/approve", asyncHandler(superAdminController.approvePurchase));
router.post("/purchases/:id/reject", asyncHandler(superAdminController.rejectPurchase));
router.get("/payouts", asyncHandler(superAdminController.listPayouts));
router.post("/payouts/:id/settle", asyncHandler(superAdminController.settlePayout));

router.get("/admins", asyncHandler(superAdminController.listAdmins));
router.post("/admins", asyncHandler(superAdminController.postAdmin));
router.patch("/admins/:id/status", asyncHandler(superAdminController.setAdminStatus));

module.exports = router;
