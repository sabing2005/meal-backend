import dotenv from "dotenv";
import app from "./app.js";
import connectDB from "./config/db.js";
import http from "http";
import { Server as SocketIOServer } from "socket.io";

process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.log("Shutting down server due to Uncaught Exception...");
  process.exit(1);
});

dotenv.config();

const startServer = async () => {
  try {
    console.clear();
    // Connect to the database
    await connectDB();

    const server = http.createServer(app);

    const io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CLIENT_ORIGIN || "*",
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
        credentials: true,
      },
    });

    app.set("io", io);

    io.on("connection", (socket) => {
      socket.on("register", (payload = {}) => {
        const { role, user_id } = payload || {};
        console.log("register", payload);
        if (role === "staff" || role === "admin") {
          console.log("admin_staff or admin joined");
          socket.join("staff:all");
        }
        socket.join(`${user_id}`);
      });

      socket.on("chat.join", (payload = {}) => {
        const { ticket_id } = payload || {};
        console.log("chat joined");
        if (ticket_id) socket.join(`chat:${ticket_id}`);
      });

      socket.on("chat.leave", (payload = {}) => {
        const { ticket_id } = payload || {};
        console.log("chat left");
        if (ticket_id) socket.leave(`chat:${ticket_id}`);
      });
      socket.on("order.join", (payload = {}) => {
        const { order_id } = payload || {};
        console.log("order joined", order_id);
        if (order_id) socket.join(`${order_id}`);
      });

      socket.on("order.leave", (payload = {}) => {
        const { order_id } = payload || {};
        console.log("order left", order_id);
        if (order_id) socket.leave(`${order_id}`);
      });
    });

    server.listen(process.env.PORT, () => {
      console.log(
        `Server is running on port: http://localhost:${process.env.PORT}/api/v1/`
      );
    });

    process.on("unhandledRejection", (err) => {
      console.error(`Unhandled Rejection: ${err.message}`);
      console.log("Shutting down server due to Unhandled Rejection...");
      server.close(() => {
        process.exit(1);
      });
    });
  } catch (error) {
    console.error("Error starting the server:", error);
    process.exit(1);
  }
};

startServer();
