import express from "express";
import { authorizeRole, isAuthenticatedUser } from "../middlewares/auth.js";
import {
  getUserOrdersHistory,
  getUserOrdersAnalytics,
  DashboardStats,
  getOrderById,
} from "../controllers/orderController.js";

const router = express.Router();
router.get("/history", isAuthenticatedUser, getUserOrdersHistory);
router.get("/analytics", isAuthenticatedUser, getUserOrdersAnalytics);
router.get("/:id", isAuthenticatedUser, getOrderById)
router.get(
  "/dashboard/stats",
  isAuthenticatedUser,
  authorizeRole("admin"),
  DashboardStats
);

export default router;
