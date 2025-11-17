import express from "express";
import { addMessage, getMessages, markMessagesRead } from "../controllers/chatController.js";
import { isAuthenticatedUser } from "../middlewares/auth.js";

const router = express.Router();

router.post("/read", isAuthenticatedUser, markMessagesRead);
router.post("/:orderId", isAuthenticatedUser, addMessage);
router.get("/:id", isAuthenticatedUser, getMessages);

export default router;
