import express from "express";
import {
  getAllCookies,
  createCookie,
  updateCookie,
  activateCookie,
  deactivateCookie,
  deleteCookie,
  getCookieById,
} from "../controllers/cookieController.js";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";

const router = express.Router();

// All routes require authentication
router.use(isAuthenticatedUser);

// Admin and staff routes
// GET /api/v1/cookies?status=active - Get active cookies
// GET /api/v1/cookies?status=inactive - Get inactive cookies
// GET /api/v1/cookies - Get all cookies
router.get("/", authorizeRole("admin", "staff"), getAllCookies);
router.get("/:id", authorizeRole("admin", "staff"), getCookieById);
router.post("/", authorizeRole("admin", "staff"), createCookie);
router.put("/:id", authorizeRole("admin", "staff"), updateCookie);
router.patch("/:id/activate", authorizeRole("admin", "staff"), activateCookie);
router.patch(
  "/:id/deactivate",
  authorizeRole("admin", "staff"),
  deactivateCookie
);
router.delete("/:id", authorizeRole("admin", "staff"), deleteCookie);

export default router;

