import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Ticket from "../models/ticketModel.js";
import Order from "../models/orderModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";
import ChatMessage from "../models/ChatMessageModel.js";

// Helper function to map ticket status for frontend
const mapTicketStatus = (ticket) => {
  // Keep status as is - no mapping needed
  return ticket;
};

// Helper function to map ticket array status for frontend
const mapTicketsStatus = (tickets) => {
  return tickets.map(ticket => mapTicketStatus(ticket.toObject ? ticket.toObject() : ticket));
};

export const claimTicket = catchAsyncErrors(async (req, res, next) => {
  const { ticket_id } = req.params;
  const staffId = req.user?.id;

  const ticket = await Ticket.findOne({ ticket_id });
  if (!ticket) return next(new ErrorHandler("Ticket not found", 404));

  // Check if ticket is already claimed
  if (ticket.claimed_by) {
    return next(new ErrorHandler("Ticket is already claimed by another staff member", 400));
  }

  ticket.claimed_by = staffId;
  // Keep status as OPEN when claimed
  await ticket.save();

  // Don't change order status when ticket is claimed - keep it PENDING
  // Order status will only change to PLACED when ticket is RESOLVED

  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${ticket.user_id}`).emit("ticket.claimed", {
        ticket_id: ticket.ticket_id,
        claimed_by: String(staffId),
        order_status: "PENDING"
      });
    }
  }

  res.json({
    success: true,
    message: "Ticket claimed successfully",
    data: {
      ticket_id: ticket.ticket_id,
      status: ticket.status,
      claimed_by: ticket.claimed_by,
      order_status: "PENDING"
    },
  });
});
export const createTicket = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user?._id;
  const { order_id, subject, priority = "MEDIUM", category = "GENERAL" } = req.body || {};

  if (!order_id) return next(new ErrorHandler("order_id is required", 400));
  if (!subject) return next(new ErrorHandler("subject is required", 400));

  const order = await Order.findOne({ order_id, user_id: userId });
  if (!order) return next(new ErrorHandler("Order not found", 404));

  let ticket = await Ticket.findOne({ order_id });
  if (ticket) {
    return res
      .status(200)
      .json({ success: true, message: "Ticket already exists", data: ticket });
  }

  const generateId = () =>
    `TKT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let ticketId = generateId();
  let exists = await Ticket.exists({ ticket_id: ticketId });
  let attempts = 0;
  while (exists && attempts < 3) {
    ticketId = generateId();
    exists = await Ticket.exists({ ticket_id: ticketId });
    attempts += 1;
  }

  ticket = await Ticket.create({
    ticket_id: ticketId,
    order_id,
    user_id: userId,
    status: "OPEN",
    subject,
    priority,
    category,
  });

  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      io.to("staff:all").emit("ticket.created", {
        ticket_id: ticket.ticket_id,
        order_id: orderId,
      });
      io.to(`user:${userId}`).emit("ticket.created", {
        ticket_id: ticket.ticket_id,
      });
    }
  }

  res
    .status(201)
    .json({ success: true, message: "Ticket created", data: ticket });
});

export const getTicketById = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const ticket = await Ticket.findById(id)
    .populate("user_id", "name email")
    .populate("claimed_by", "name email");
  if (!ticket) return next(new ErrorHandler("Ticket not found", 404));




  res.json({ success: true, data: { ticket: mapTicketStatus(ticket.toObject()) } });
});

export const updateTicketStatus = catchAsyncErrors(async (req, res, next) => {
  const { ticket_id } = req.params;
  const { status } = req.body || {};
  const allowed = ["OPEN", "RESOLVED", "CLOSED", "CANCELLED"];
  if (!allowed.includes(status))
    return next(new ErrorHandler("Invalid status", 400));

  const ticket = await Ticket.findOne({ ticket_id });
  if (!ticket) return next(new ErrorHandler("Ticket not found", 404));

  // Authorization logic
  const isAdmin = req.user?.role === "admin";
  const isStaff = req.user?.role === "staff";
  const isTicketClaimer = String(ticket.claimed_by) === String(req.user?._id);

  // Only admin can change any ticket status
  // Staff can only change status of tickets they claimed
  if (!isAdmin && (!isStaff || !isTicketClaimer)) {
    return next(new ErrorHandler("You can only update tickets you have claimed", 403));
  }

  const oldStatus = ticket.status;
  ticket.status = status;
  await ticket.save();

  // Get order for status updates and notifications
  const order = await Order.findOne({ order_id: ticket.order_id });
  let orderStatus = order?.status;

  // Update order status when ticket is resolved
  if (status === "RESOLVED" && order) {
    order.status = "PLACED";
    orderStatus = "PLACED";
    await order.save();
  }

  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      io.to(`chat:${ticket.ticket_id}`).emit("ticket.status", {
        ticket_id: ticket.ticket_id,
        status,
        order_status: orderStatus
      });
      io.to(`user:${ticket.user_id}`).emit("ticket.status", {
        ticket_id: ticket.ticket_id,
        status,
        order_status: orderStatus
      });
    }
  }

  res.json({
    success: true,
    message: status === "RESOLVED" ? "Ticket resolved and order marked as PLACED" : "Status updated",
    data: {
      ticket_id: ticket.ticket_id,
      status,
      order_status: orderStatus
    },
  });
});
// @desc    Get all tickets with pagination, search, and filtering
// @route   GET /api/tickets?page=1&limit=10&search=&status=&priority=&category=&assigned=
export const getAllTickets = catchAsyncErrors(async (req, res, next) => {
  const user = req.user;
  const { page = 1, limit = 10, search, status, priority, category, assigned, paymentType } = req.query || {};

  let query = {};

  // Filter out invalid statuses (IN_PROGRESS and FULFILLED)
  query.status = { $in: ["OPEN", "RESOLVED", "CLOSED", "CANCELLED"] };

  // Role-based filtering
  if (user.role === "admin") {
    // Keep the status filter above
  } else if (user.role === "staff") {
    // Only show unclaimed tickets to staff
    query.claimed_by = null;
  } else {
    query.user_id = user._id;
  }

  // Search functionality - search in ticket_id, order_id, subject
  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");
    const searchConditions = [
      { ticket_id: searchRegex },
      { order_id: searchRegex },
      { subject: searchRegex }
    ];

    // If we already have role-based query with $or, we need to combine them
    if (query.$or) {
      query.$and = [
        { $or: query.$or },
        { $or: searchConditions }
      ];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  // Status filter
  if (status) {
    query.status = status;
  }

  // Priority filter
  if (priority) {
    query.priority = priority;
  }

  // Category filter
  if (category) {
    query.category = category;
  }

  // Assigned staff filter
  if (assigned) {
    if (assigned === "unassigned") {
      query.claimed_by = null;
    } else {
      query.claimed_by = assigned;
    }
  }

  const skip = (Number(page) - 1) * Number(limit);

  // If payment type filter is requested, use aggregation pipeline
  if (paymentType) {
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "orders",
          localField: "order_id",
          foreignField: "order_id",
          as: "order"
        }
      },
      { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "payments",
          let: { orderId: "$order_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$orderId", "$$orderId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 }
          ],
          as: "payment"
        }
      },
      { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },
      { $match: { "payment.method": paymentType } },
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user_id",
          pipeline: [{ $project: { name: 1, email: 1 } }]
        }
      },
      { $unwind: { path: "$user_id", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "claimed_by",
          foreignField: "_id",
          as: "claimed_by",
          pipeline: [{ $project: { name: 1, email: 1 } }]
        }
      },
      { $unwind: { path: "$claimed_by", preserveNullAndEmptyArrays: true } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) }
    ];

    const [tickets, total] = await Promise.all([
      Ticket.aggregate(pipeline),
      Ticket.aggregate([...pipeline.slice(0, -2), { $count: "total" }])
    ]);

    res.status(200).json({
      success: true,
      message: "Tickets fetched successfully",
      data: {
        total: total[0]?.total || 0,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil((total[0]?.total || 0) / Number(limit)),
        count: tickets.length,
        tickets: mapTicketsStatus(tickets),
      },
    });
  } else {
    // Original logic for when no payment type filter
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .populate("user_id", "name email")
        .populate("claimed_by", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Ticket.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: "Tickets fetched successfully",
      data: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
        count: tickets.length,
        tickets: mapTicketsStatus(tickets),
      },
    });
  }
});

// @desc    Get ticket stats (optimized, no manual loop)
// @route   GET /api/tickets/stats
export const getTicketStats = catchAsyncErrors(async (req, res, next) => {
  const stats = await Ticket.aggregate([
    {
      $match: {
        claimed_by: null // Only count unclaimed tickets
      }
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        stats: { $push: { k: "$_id", v: "$count" } },
        total: { $sum: "$count" },
      },
    },
    {
      $project: {
        _id: 0,
        total: 1,
        stats: { $arrayToObject: "$stats" },
      },
    },
  ]);

  // Filter out IN_PROGRESS and FULFILLED from stats, only keep valid statuses
  const result = stats[0] || { total: 0, stats: {} };
  const filteredStats = {};
  let validTotal = 0;
  
  // Only include valid statuses: OPEN, RESOLVED, CLOSED, CANCELLED
  const validStatuses = ['OPEN', 'RESOLVED', 'CLOSED', 'CANCELLED'];
  validStatuses.forEach(status => {
    if (result.stats[status]) {
      filteredStats[status] = result.stats[status];
      validTotal += result.stats[status];
    }
  });

  res.status(200).json({
    success: true,
    total: validTotal,
    stats: filteredStats,
  });
});

export const getMyTickets = catchAsyncErrors(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    Ticket.find({ 
      user_id: req.user._id,
      status: { $in: ["OPEN", "RESOLVED", "CLOSED", "CANCELLED"] }
    })
      .populate("claimed_by", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Ticket.countDocuments({ 
      user_id: req.user._id,
      status: { $in: ["OPEN", "RESOLVED", "CLOSED", "CANCELLED"] }
    }),
  ]);

  res.json({
    success: true,
    page,
    totalPages: Math.ceil(total / limit),
    totalTickets: total,
    count: tickets.length,
    tickets: mapTicketsStatus(tickets),
  });
});

// @desc    Get dashboard statistics for tickets
// @route   GET /api/tickets/dashboard-stats
export const getDashboardStats = catchAsyncErrors(async (req, res, next) => {
  const stats = await Ticket.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ["$status", "OPEN"] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ["$status", "RESOLVED"] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ["$status", "CLOSED"] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } }
      }
    }
  ]);

  const result = stats[0] || { total: 0, open: 0, resolved: 0, closed: 0, cancelled: 0 };

  res.json({
    success: true,
    message: "Dashboard statistics fetched",
    data: {
      total: result.total,
      open: result.open,
      resolved: result.resolved,
      closed: result.closed,
      cancelled: result.cancelled
    }
  });
});

// @desc    Assign staff to ticket
// @route   PATCH /api/tickets/:ticket_id/assign
export const assignStaff = catchAsyncErrors(async (req, res, next) => {
  const { ticket_id } = req.params;
  const { staff_id } = req.body || {};

  if (!staff_id) return next(new ErrorHandler("staff_id is required", 400));

  const ticket = await Ticket.findOne({ ticket_id });
  if (!ticket) return next(new ErrorHandler("Ticket not found", 404));

  // Check if staff exists and has appropriate role
  const staff = await User.findById(staff_id);
  if (!staff) return next(new ErrorHandler("Staff member not found", 404));
  if (!["admin", "staff"].includes(staff.role)) {
    return next(new ErrorHandler("User is not authorized to handle tickets", 400));
  }

  ticket.claimed_by = staff_id;
  // Keep status as OPEN when assigned
  await ticket.save();

  // Don't change order status when staff is assigned - keep it PENDING
  // Order status will only change to PLACED when ticket is RESOLVED

  // Populate the assigned staff info
  await ticket.populate("claimed_by", "name email");

  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${ticket.user_id}`).emit("ticket.assigned", {
        ticket_id: ticket.ticket_id,
        assigned_staff: {
          id: ticket.claimed_by._id,
          name: ticket.claimed_by.name,
          email: ticket.claimed_by.email
        }
      });
    }
  }

  res.json({
    success: true,
    message: "Staff assigned to ticket",
    data: {
      ticket_id: ticket.ticket_id,
      assigned_staff: {
        id: ticket.claimed_by._id,
        name: ticket.claimed_by.name,
        email: ticket.claimed_by.email
      },
      status: ticket.status
    }
  });
});
export const addAdminNote = catchAsyncErrors(async (req, res, next) => {
  const { ticketId } = req.params;
  const { note } = req.body;

  if (!note || note.trim() === "") {
    return next(new ErrorHandler("Note is required", 400));
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return next(new ErrorHandler("Ticket not found", 404));
  }

  ticket.adminNotes.push(note);
  await ticket.save();

  res.status(200).json({
    success: true,
    message: "Note added successfully",
    data: ticket,
  });
});