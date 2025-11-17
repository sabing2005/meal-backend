import ChatMessage from "../models/ChatMessageModel.js";
import Ticket from "../models/ticketModel.js";
import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Order from "../models/orderModel.js";
import mongoose from "mongoose";

export const addMessage = catchAsyncErrors(async (req, res, next) => {
  const { message, attachments, isInternal } = req.body || {};
  const orderId = req.params.orderId;

  if (!message || !message.trim()) {
    return next(new ErrorHandler("message is required", 400));
  }

  const ticket = await Ticket.findOne({ order_id: orderId });
  if (!ticket) return next(new ErrorHandler("Ticket not found", 404));

  const isStaff = ["admin", "admin_staff"].includes(req.user?.role);

  /* if (
    req.user.role !== "admin" &&
    ticket.user_id.toString() !== req.user.id.toString()
  )
    return next(new ErrorHandler("Forbidden", 403)); */

  const internal = Boolean(isInternal) && isStaff;

  const chat = await ChatMessage.create({
    ticket_id: ticket._id,
    sender_id: req.user.id,
    message,
    attachments,
    isInternal: internal,
  });

  if (req.app?.get) {
    const io = req.app.get("io");
    if (io) {
      io.to(`${ticket.order_id}`).emit(
        "chat.message",
        {
          ticket_id: ticket.ticket_id,
          message: chat,
        },
        (ack) => {
          console.log("Client order acknowledged message:", ack);
        }
      );
      /* io.to("staff:all").emit(
        "chat.message",
        {
          ticket_id: ticket.ticket_id,
          message: chat,
        },
        (ack) => {
          console.log("Client staff  acknowledged message:", ack);
        }
      ); */
    }
  }

  res.status(201).json({ success: true, chat });
});

export const getMessages = catchAsyncErrors(async (req, res, next) => {
  const orderId = req.params.id;
  const ticket = await Ticket.findOne({ order_id: orderId });
  if (!ticket) return next(new ErrorHandler("Ticket not found", 404));

  const isStaff = ["admin", "admin_staff"].includes(req.user?.role);

  const query = { ticket_id: ticket._id };
  if (!isStaff) {
    // users cannot see internal notes
    Object.assign(query, { isInternal: { $ne: true } });
  }

  const chats = await ChatMessage.find(query)
    .populate("sender_id", "name email role")
    .sort({ createdAt: 1 });
  res.json({ success: true, chats });
});
/**
 * Mark chat messages as read by current user
 * 
 * Body:
 * - ticketId: ObjectId
 * - messageIds?: [ObjectId] (optional, if empty → mark all messages in ticket as read)
 */
export const markMessagesRead = catchAsyncErrors(async (req, res, next) => {
  const { messageIds } = req.body;
  
  // ✅ Always convert to ObjectId
  const userId = new mongoose.Types.ObjectId(req.user.id);

  const filter = {
    sender_id: { $ne: userId }, // don’t mark own messages
  };

  if (Array.isArray(messageIds) && messageIds.length > 0) {
    filter._id = { $in: messageIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const result = await ChatMessage.updateMany(
    filter,
    { $addToSet: { readBy: userId } } // ✅ ObjectId, not string
  );


  res.json({
    success: true,
    message: "Messages marked as read",
    modified: result.modifiedCount,
    matched: result.matchedCount,
  });
});
