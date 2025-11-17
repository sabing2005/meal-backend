import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    ticket_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
      index: true,
    },
    sender_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: { type: String, required: true },
    attachments: [{ type: String }], // optional: file/image URLs
    isInternal: { type: Boolean, default: false }, // true = only staff see this
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // who has read this message
      },
    ],
  },
  { timestamps: true }
);

const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

export default ChatMessage;
