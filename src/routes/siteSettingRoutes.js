import express from "express";
import { upsertSiteSettings, getSiteSettings } from "../controllers/siteSettingController.js";
import { authorizeRole, isAuthenticatedUser } from "../middlewares/auth.js";

const router = express.Router();

router.post("/upsert", isAuthenticatedUser, authorizeRole('admin'), upsertSiteSettings);
router.get("/", getSiteSettings);

export default router;
