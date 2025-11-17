import express from "express";
import {
  createSolanaPayment,
  confirmSolanaPayment,
  getSolanaPaymentStatus,
} from "../controllers/solanaPaymentController.js";
import { simulatePayment, createPaymentIntent } from "../controllers/paymentController.js";
import { isAuthenticatedUser } from "../middlewares/auth.js";
const router = express.Router();
router.use(isAuthenticatedUser);
router.post("/create-payment-intent", createPaymentIntent);
router.post("/create-solana-payment", createSolanaPayment);
router.post("/create-simulate-payment-intent", simulatePayment);
router.post("/confirm-solana-payment", confirmSolanaPayment);
router.get("/:id/status", getSolanaPaymentStatus);

export default router;
