import mongoose from "mongoose";

const ticketSchema = new mongoose.Schema(
  {
    ticket_id: { type: String, required: true, unique: true },
    order_id: { type: String, required: true, unique: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    claimed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    status: { type: String, enum: ["OPEN", "RESOLVED", "CLOSED", "CANCELLED"], default: "OPEN", index: true },
    adminNotes: [String]

  },
  { timestamps: true }
);

const Ticket = mongoose.model("Ticket", ticketSchema);

export default Ticket; 