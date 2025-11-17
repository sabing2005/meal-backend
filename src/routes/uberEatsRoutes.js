import express from "express";
import { scrapeUberEatsGroupOrderLink, refreshSid } from "../controllers/uberEatsController.js";
import { isAuthenticatedUser } from "../middlewares/auth.js";

const router = express.Router();
router.use(isAuthenticatedUser);
router.post("/scrape-group-order", scrapeUberEatsGroupOrderLink);
router.post("/refresh-sid", refreshSid);

export default router;
