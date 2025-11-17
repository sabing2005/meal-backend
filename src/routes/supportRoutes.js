import express from "express";
import { contactSupport } from "../controllers/supportController.js";

const router = express.Router();

router.post("/contact", contactSupport);

export default router;
