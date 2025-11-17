import express from "express";
import { isAuthenticatedUser, authorizeRole } from "../middlewares/auth.js";
import {
  claimTicket,
  getAllTickets,
  getTicketStats,
  createTicket,
  getTicketById,
  updateTicketStatus,
  getMyTickets,
  getDashboardStats,
  assignStaff,
  addAdminNote,
} from "../controllers/ticketController.js";
import chatRouter from "./chatRoutes.js";

const router = express.Router();
router.use(isAuthenticatedUser);

// Dashboard and stats
router.get("/", getAllTickets);
router.get("/stats", authorizeRole("admin", "staff"), getTicketStats);
router.get("/dashboard-stats", authorizeRole("admin", "staff"), getDashboardStats);

// Staff operations
router.patch(
  "/:ticket_id/claim",
  authorizeRole("admin", "staff"),
  claimTicket
);
router.patch(
  "/:ticket_id/assign",
  authorizeRole("admin"),
  assignStaff
);
router.patch(
  "/:ticket_id/status",
  updateTicketStatus
);

// User-facing
router.post("/", createTicket);
router.get("/mine", getMyTickets);
router.get("/:id", getTicketById);
router.put("/:ticketId/admin-notes", isAuthenticatedUser, authorizeRole('admin', 'staff'), addAdminNote);


// mount chat under tickets
router.use("/:id", chatRouter);

export default router;

