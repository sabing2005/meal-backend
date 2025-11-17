import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import chalk from "chalk";
import errorMiddleware from "./middlewares/defaultError.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import ticketRoutes from "./routes/ticketRoutes.js";
import uberEatsRoutes from "./routes/uberEatsRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import siteSettingRoutes from "./routes/siteSettingRoutes.js";
import cookieRoutes from "./routes/cookieRoutes.js";
import {
  stripeWebhook,
  stripeWebhookMiddleware,
} from "./controllers/stripeWebhookController.js";

const app = express();

app.post("/api/webhooks/stripe", stripeWebhookMiddleware, stripeWebhook);

// stripe listen --forward-to localhost:8001/api/webhooks/stripe
app.use(express.json());
app.use(helmet());
app.use(bodyParser.json());
app.use(cookieParser());

// ✅ CORS updated to include backend domain as well
app.use(
  cors({
    origin: [
      "http://localhost:5181",
      "https://me.senew-tech.com",   // frontend
      "https://meb.senew-tech.com"   // ✅ backend added
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    optionsSuccessStatus: 200
  })
);

const colorByStatus = (status, message) => {
  if (status >= 500) return chalk.red(message); // Server error
  if (status >= 400) return chalk.yellow(message); // Client error
  if (status >= 300) return chalk.cyan(message); // Redirection
  if (status >= 200) return chalk.green(message); // Success
  return chalk.white(message); // Info / Others
};

app.use(
  morgan((tokens, req, res) => {
    const method = tokens.method(req, res);
    const url = tokens.url(req, res);
    const status = Number(tokens.status(req, res));
    const responseTime = tokens["response-time"](req, res);
    const rawMessage = `${method} ${url} ${status} - ${responseTime} ms`;
    return colorByStatus(status, rawMessage);
  })
);

const BASE_ROUTE = "/api/v1";
app.use(`${BASE_ROUTE}/site-settings`, siteSettingRoutes);
app.use(`${BASE_ROUTE}/auth`, authRoutes);
app.use(`${BASE_ROUTE}/user`, userRoutes);
app.use(`${BASE_ROUTE}/admin`, adminRoutes);
app.use(`${BASE_ROUTE}/support`, supportRoutes);
app.use(`${BASE_ROUTE}/uber-eats`, uberEatsRoutes);
app.use(`${BASE_ROUTE}/orders`, orderRoutes);
app.use(`${BASE_ROUTE}/payments`, paymentRoutes);
app.use(`${BASE_ROUTE}/tickets`, ticketRoutes);
app.use(`${BASE_ROUTE}/chat`, chatRoutes);
app.use(`${BASE_ROUTE}/cookies`, cookieRoutes);

app.use(errorMiddleware);

export default app;
