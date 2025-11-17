import express from "express";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";
import {
  listAdminOrders,
  promoteToAdminStaff,
  promoteToAdmin,
  listStaffs,
  activateStaff,
  deactivateStaff,
  getAllUsers,
  createStaff,
  updateStaff,
  deleteStaff,
  changeUserPassword,
  getStaffById,
  activateUser,
  deactivateUser,
  createUser,
  updateUser,
  deleteUser,
  getUserById,
  listUsers,
  getDashboardOverview,
  getMonthlyOrders,
  getWeeklyVolume,
  debugPayments,
  updateOrderStatus,
  getAllStaff,
} from "../controllers/adminController.js";

const router = express.Router();

router.use(isAuthenticatedUser);

// Admin-only actions
router.post("/staffs", authorizeRole("admin"), createStaff);
router.get("/staffs", authorizeRole("admin"), listStaffs);
router.get("/staffs/:userId", authorizeRole("admin"), getStaffById);
router.put("/staffs/:userId", authorizeRole("admin"), updateStaff);
router.delete("/staffs/:userId", authorizeRole("admin"), deleteStaff);
router.patch("/staffs/:userId/activate", authorizeRole("admin"), activateStaff);
router.patch(
  "/staffs/:userId/deactivate",
  authorizeRole("admin"),
  deactivateStaff
);
router.patch("/promote-to-staff", authorizeRole("admin"), promoteToAdminStaff);
router.patch("/promote-to-admin", authorizeRole("admin"), promoteToAdmin);

// Generic user management endpoints (admin only)
router.get("/users", authorizeRole("admin"), listUsers);
router.get("/users/:userId", authorizeRole("admin"), getUserById);
router.post("/users", authorizeRole("admin"), createUser);
router.put("/users/:userId", authorizeRole("admin"), updateUser);
router.delete("/users/:userId", authorizeRole("admin"), deleteUser);
router.patch("/users/:userId/activate", authorizeRole("admin"), activateUser);
router.patch(
  "/users/:userId/deactivate",
  authorizeRole("admin"),
  deactivateUser
);
router.patch(
  "/users/:userId/change-password",
  authorizeRole("admin"),
  changeUserPassword
);

// Legacy endpoints for backward compatibility
router.get("/users-legacy", authorizeRole("admin"), getAllUsers);

// Other admin endpoints
router.get("/orders", authorizeRole("admin", "staff"), listAdminOrders);
router.get("/orders/monthly", authorizeRole("admin", "staff"), getMonthlyOrders);
router.patch("/orders/:orderId/status", authorizeRole("admin", "staff"), updateOrderStatus);
router.get("/staff", authorizeRole("admin", "staff"), getAllStaff);

// Dashboard analytics endpoints (admin and staff)
router.get("/dashboard/overview", authorizeRole("admin", "staff"), getDashboardOverview);
router.get("/dashboard/weekly-volume", authorizeRole("admin", "staff"), getWeeklyVolume);

// Debug endpoints (admin and staff)
router.get("/debug/payments", authorizeRole("admin", "staff"), debugPayments);

export default router;
