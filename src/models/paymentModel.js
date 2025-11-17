import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {

    amount: { type: Number, required: true }, 
    currency: { type: String, default: "SOL" },
    method: {
      type: String,
      enum: ["solana", "card", "token"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "success", "failed"],
      default: "pending",
    },
    failureReason: { type: String, default: null },

    // Solana specific
    recipient: { type: String },
    txSignature: { type: String, default: null },

    // Card specific
    cardProvider: { type: String }, // e.g., stripe, visa
    cardTransactionId: { type: String },

    // Token specific (SPL/other blockchain tokens)
    tokenType: { type: String }, // e.g., USDC, DAI
    tokenAddress: { type: String },
    tokenTxHash: { type: String },
    stripe_payment_intent_id: { type: String },


    // Order context fields
    orderId: { type: String },
    publicKey: { type: String },
    orderSummary: { type: Object },
    cartLink: { type: String },
  },
  { timestamps: true }
);

// Indexes for faster lookups
PaymentSchema.index({ orderId: 1 }, { unique: true });
PaymentSchema.index({ method: 1, status: 1 });
PaymentSchema.index({ txSignature: 1 });
PaymentSchema.index({ cardTransactionId: 1 });
PaymentSchema.index({ tokenTxHash: 1 });

const Payment = mongoose.model("Payment", PaymentSchema);
export default Payment;
