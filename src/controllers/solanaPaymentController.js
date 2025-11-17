import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import { v4 as uuidv4 } from "uuid";
import Payment from "../models/paymentModel.js";
import { lamportsFromSol, validPubkeyOrThrow } from "../utils/solana.js";
// import { verifyQueue } from "../queue/queue.js";
import ErrorHandler from "../utils/errorHandler.js";

import { LAMPORTS_PER_SOL, Connection } from "@solana/web3.js";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

// Solana connection from .env
const connection = new Connection(process.env.SOLANA_RPC, "confirmed");
const RECIPIENT_PUBLIC_KEY = process.env.RECIPIENT_PUBLIC_KEY;

// Helper: sleep
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Helper: retry transaction fetch
async function waitForTransaction(txSignature, retries = 6, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    const parsed = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
    });
    if (parsed) return parsed;
    console.log(`Transaction not found yet, retrying ${i + 1}/${retries}...`);
    await sleep(delay);
  }
  return null;
}

export const confirmSolanaPayment = catchAsyncErrors(async (req, res, next) => {
  try {
    const {
      paymentId,
      txSignature,
      amount,
      orderId,
      publicKey,
      paymentMethod,
      orderSummary,
      cartLink,
    } = req.body;
    console.log("Payment confirmation request:", req.body);

    if (!paymentId || !txSignature) {
      return next(
        new ErrorHandler("paymentId and txSignature are required", 400)
      );
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) return next(new ErrorHandler("Payment not found", 404));
    if (payment.method !== "solana") {
      return next(new ErrorHandler("Payment method mismatch", 400));
    }

    const expectedLamports = Math.floor(amount * LAMPORTS_PER_SOL);

    payment.txSignature = txSignature;
    payment.status = "processing";
    await payment.save();

    console.log("txSignature received:", txSignature);

    const status = await connection.getSignatureStatuses([txSignature]);
    if (!status.value[0]) {
      throw new Error("Transaction not found in signature status yet.");
    }

    const parsed = await waitForTransaction(txSignature, 6, 2000);
    if (!parsed) {
      throw new Error("Transaction not found on chain after retries.");
    }

    console.log("Parsed transaction found", parsed);

    const instructions = parsed.transaction.message.instructions || [];
    let memoFound = false;

    for (const ins of instructions) {
      if (
        ins.program === "spl-memo" ||
        ins.programId === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
      ) {
        let memoText = null;

        if (typeof ins.parsed === "string") {
          memoText = ins.parsed;
        } else if (ins.parsed?.memo) {
          memoText = ins.parsed.memo;
        } else if (ins.data) {
          try {
            memoText = Buffer.from(bs58.decode(ins.data)).toString("utf8");
          } catch (err) {
            console.error("Failed to decode memo data:", err);
          }
        }

        console.log("Decoded memo:", memoText, "Expected:", payment.reference);

        if (memoText && memoText === payment.reference) {
          memoFound = true;
          break;
        }
      }
    }

    if (!memoFound) {
      payment.status = "failed";
      payment.failureReason = "Memo reference not present or mismatch.";
      await payment.save();
      return res.json({ success: false, reason: payment.failureReason });
    }

    const preBalances = parsed.meta?.preBalances || [];
    const postBalances = parsed.meta?.postBalances || [];
    const accountKeys = parsed.transaction.message.accountKeys.map((k) =>
      k.pubkey.toString()
    );

    const recipientIndex = accountKeys.indexOf(payment.recipient);
    if (recipientIndex === -1) {
      payment.status = "failed";
      payment.failureReason = "Recipient not present in transaction accounts.";
      await payment.save();
      return res.json({ success: false, reason: payment.failureReason });
    }

    const balanceDelta =
      postBalances[recipientIndex] - preBalances[recipientIndex];
    if (balanceDelta < expectedLamports) {
      payment.status = "failed";
      payment.failureReason = `Recipient received ${balanceDelta} lamports but expected ${expectedLamports}.`;
      await payment.save();
      return res.json({ success: false, reason: payment.failureReason });
    }

    payment.status = "success";
    payment.txSignature = txSignature;
    payment.amountLamports = expectedLamports;
    await payment.save();

    console.log("Payment verified:", payment);

    res.json({
      success: true,
      message: "Payment verification successful",
      payment,
      data: {
        id: payment._id,
        reference: payment.reference,
        txSignature: payment.txSignature,
        status: payment.status,
      },
    });
  } catch (error) {
    console.log("Error in API:", error);
    return next(
      new ErrorHandler(error.message || "Solana verification failed", 500)
    );
  }
});

export const createSolanaPayment = catchAsyncErrors(async (req, res, next) => {
  const {
    amountSol,
    orderId,
    publicKey,
    paymentMethod,
    orderSummary,
    cartLink,
  } = req.body;
  console.log("Creating Solana payment:", req.body);

  if (typeof amountSol !== "number" || amountSol <= 0) {
    return next(new ErrorHandler("amountSol must be a positive number", 400));
  }

  const recipient = process.env.RECIPIENT_PUBLIC_KEY;
  if (!recipient)
    return next(new ErrorHandler("Recipient not configured", 500));

  try {
    validPubkeyOrThrow(recipient);
  } catch (err) {
    return next(new ErrorHandler("Invalid recipient public key", 500));
  }

  const reference = uuidv4();
  const amountLamports = lamportsFromSol(amountSol);

  const payment = new Payment({
    reference,
    amount: amountLamports,
    currency: "SOL",
    method: "solana",
    recipient,
    status: "pending",
    // Store additional order context
    orderId,
    publicKey,
    paymentMethod,
    orderSummary,
    cartLink,
  });

  await payment.save();

  res.status(201).json({
    success: true,
    message: "Payment created successfully",
    data: {
      id: payment._id,
      reference: payment.reference,
      method: payment.method,
      currency: payment.currency,
      amount: payment.amount,
      recipient: payment.recipient,
      status: payment.status,
      orderId,
      publicKey,
    },
  });
});

export const confirmSolanaPaymentsssss = catchAsyncErrors(
  async (req, res, next) => {
    try {
      const { txSignature, paymentId } = req.body;
      console.log("Request : ", req.body);
      if (!paymentId || !txSignature) {
        return next(
          new ErrorHandler("paymentId and txSignature are required", 400)
        );
      }
      const payment = await Payment.findById(paymentId);

      if (!payment) return next(new ErrorHandler("Payment not found", 404));
      if (payment.method !== "solana") {
        return next(new ErrorHandler("Payment method mismatch", 400));
      }
      payment.txSignature = txSignature;
      payment.status = "processing";
      await payment.save();
      console.log("txSignature received:", txSignature);

      let parsed;
      try {
        parsed = await connection.getParsedTransaction(txSignature, {
          maxSupportedTransactionVersion: 0,
        });
        console.log("parsed : ", parsed);
      } catch (error) {
        console.log("Error comes in solana connection : ", error);
      }

      if (!parsed) {
        throw new Error("Transaction not found on chain yet.");
      }

      const instructions = parsed.transaction.message.instructions || [];
      let memoFound = false;
      for (const ins of instructions) {
        if (ins.program === "spl-memo") {
          const data = (ins.parsed && ins.parsed.memo) || ins.data || null;
          if (data && data === payment.reference) {
            memoFound = true;
            break;
          }
        }
      }
      if (!memoFound) {
        payment.status = "failed";
        payment.failureReason = "Memo reference not present or mismatch.";
        await payment.save();
        return { success: false, reason: payment.failureReason };
      }
      const preBalances = parsed.meta?.preBalances || [];
      const postBalances = parsed.meta?.postBalances || [];
      const accountKeys = parsed.transaction.message.accountKeys.map((k) =>
        k.pubkey.toString()
      );
      const recipientIndex = accountKeys.indexOf(payment.recipient);
      if (recipientIndex === -1) {
        payment.status = "failed";
        payment.failureReason =
          "Recipient not present in transaction accounts.";
        await payment.save();
        return { success: false, reason: payment.failureReason };
      }
      const balanceDelta =
        postBalances[recipientIndex] - preBalances[recipientIndex];
      if (balanceDelta < payment.amountLamports) {
        payment.status = "failed";
        payment.failureReason = `Recipient received ${balanceDelta} lamports but expected ${payment.amountLamports}.`;
        await payment.save();
        return { success: false, reason: payment.failureReason };
      }
      payment.status = "success";
      payment.txSignature = txSignature;
      await payment.save();
      // return { success: true };
      console.log("Payments :", payment);
      res.json({
        success: true,
        message: "Payment verification queued",
        payment,
        data: {
          id: payment?._id,
          reference: payment?.reference,
          txSignature: payment?.txSignature,
          status: payment?.status,
        },
      });
    } catch (error) {
      console.log("Error in API : ", error);
    }
  }
);

// Get Payment Status
export const getSolanaPaymentStatus = catchAsyncErrors(
  async (req, res, next) => {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return next(new ErrorHandler("Payment not found", 404));

    res.json({
      success: true,
      data: {
        id: payment._id,
        reference: payment.reference,
        method: payment.method,
        currency: payment.currency,
        amount: payment.amount,
        status: payment.status,
        txSignature: payment.txSignature,
        failureReason: payment.failureReason,
        recipient: payment.recipient,
        cardProvider: payment.cardProvider,
        cardTransactionId: payment.cardTransactionId,
        tokenType: payment.tokenType,
        tokenAddress: payment.tokenAddress,
        tokenTxHash: payment.tokenTxHash,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  }
);

// try {
//     await verifyQueue.add("verify-payment", {
//     paymentId: payment._id.toString(),
//     txSignature,
//     recipient: payment.recipient,
//     amount: payment.amount,
//   });
//   console.log("Added to queve .......")
// } catch (error) {
//   console.log("Error in que :",error)
// }
