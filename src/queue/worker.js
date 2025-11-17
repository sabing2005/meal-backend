// import dotenv from "dotenv";
// import { Worker } from "bullmq";
// import IORedis from "ioredis";
// import mongoose from "mongoose";
// import Payment from "../models/Payment.js";
// import { connection } from "../utils/solana.js";

// dotenv.config();

// const redisOptions = {
//   host: process.env.REDIS_HOST || "127.0.0.1",
//   port: Number(process.env.REDIS_PORT || 6379),
// };
// if (process.env.REDIS_PASSWORD) {
//   redisOptions.password = process.env.REDIS_PASSWORD;
// }

// const workerConnection = new IORedis(redisOptions);
// console.log("workerConnection :",workerConnection)


// workerConnection.on("connect", () => {
//   console.log("✅ Worker connected to Redis:", `${redisOptions.host}:${redisOptions.port}`);
// });
// workerConnection.on("error", (err) => {
//   console.error("❌ Redis connection error (worker):", err.message);
// });

// const concurrency = Number(process.env.WORKER_CONCURRENCY || 5);

// async function startWorker() {
//     console.log("Worker connected");
//   const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/solana_pay";
//   await mongoose.connect(mongoUri, {});
//   console.log("✅ Worker connected to MongoDB");

//   const worker = new Worker(
//     "verify-payment",
//     async (job) => {
//       console.log("Job : ",job)
//       const { paymentId, txSignature } = job.data;
//       console.log(`[worker] verify job for paymentId=${paymentId} signature=${txSignature}`);

//       const payment = await Payment.findById(paymentId);
//       if (!payment) throw new Error("Payment not found: " + paymentId);

//       payment.status = "processing";
//       await payment.save();

//       const parsed = await connection.getParsedTransaction(txSignature, {
//         maxSupportedTransactionVersion: 0,
//       });

//       if (!parsed) {
//         throw new Error("Transaction not found on chain yet.");
//       }

//       const instructions = parsed.transaction.message.instructions || [];
//       let memoFound = false;
//       for (const ins of instructions) {
//         if (ins.program === "spl-memo") {
//           const data = (ins.parsed && ins.parsed.memo) || ins.data || null;
//           if (data && data === payment.reference) {
//             memoFound = true;
//             break;
//           }
//         }
//       }

//       if (!memoFound) {
//         payment.status = "failed";
//         payment.failureReason = "Memo reference not present or mismatch.";
//         await payment.save();
//         return { success: false, reason: payment.failureReason };
//       }

//       const preBalances = parsed.meta?.preBalances || [];
//       const postBalances = parsed.meta?.postBalances || [];
//       const accountKeys = parsed.transaction.message.accountKeys.map((k) => k.pubkey.toString());

//       const recipientIndex = accountKeys.indexOf(payment.recipient);
//       if (recipientIndex === -1) {
//         payment.status = "failed";
//         payment.failureReason = "Recipient not present in transaction accounts.";
//         await payment.save();
//         return { success: false, reason: payment.failureReason };
//       }

//       const balanceDelta = postBalances[recipientIndex] - preBalances[recipientIndex];
//       if (balanceDelta < payment.amountLamports) {
//         payment.status = "failed";
//         payment.failureReason = `Recipient received ${balanceDelta} lamports but expected ${payment.amountLamports}.`;
//         await payment.save();
//         return { success: false, reason: payment.failureReason };
//       }

//       payment.status = "success";
//       payment.txSignature = txSignature;
//       await payment.save();
//       return { success: true };
//     },
//     {
//       connection: workerConnection, 
//       concurrency,
//     }
//   );

//   worker.on("completed", (job) => {
//     console.log(`[worker] job ${job.id} completed`);
//   });

//   worker.on("failed", (job, err) => {
//     console.error(`[worker] job ${job?.id} failed: ${err?.message}`);
//   });

//   console.log("🚀 Worker started.");
// }

// startWorker().catch((err) => {
//   console.error("Failed to start worker:", err);
//   process.exit(1);
// });
