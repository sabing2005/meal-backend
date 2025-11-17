// // src/queue/queue.js
// import { Queue } from "bullmq";
// import IORedis from "ioredis";
// import dotenv from "dotenv";

// dotenv.config();

// const redisOptions = {
//   host: process.env.REDIS_HOST || "127.0.0.1",
//   port: Number(process.env.REDIS_PORT || 6379),
// };

// if (process.env.REDIS_PASSWORD) {
//   redisOptions.password = process.env.REDIS_PASSWORD;
// }

// const connection = new IORedis(redisOptions);
// console.log("connection :",connection)

// connection.on("connect", () => {
//   console.log("✅ Queue connected to Redis:", `${redisOptions.host}:${redisOptions.port}`);
// });

// connection.on("error", (err) => {
//   console.error("❌ Redis connection error (queue):", err.message);
// });

// const verifyQueue = new Queue("verify-payment", {
//   connection,
//   defaultJobOptions: {
//     attempts: 6,
//     backoff: { type: "exponential", delay: 2000 },
//     removeOnComplete: true,
//     removeOnFail: false,
//   },
// });

// export { verifyQueue, connection };
