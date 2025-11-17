import bodyParser from "body-parser";
import stripe from "../config/stripe.js";
import Payment from "../models/paymentModel.js";
import { generateTicketId } from "../helpers/index.js";
import Order from "../models/orderModel.js";
import Ticket from "../models/ticketModel.js";

// Middleware: Stripe needs raw body, not JSON-parsed
export const stripeWebhookMiddleware = bodyParser.raw({
  type: "application/json",
});

export const stripeWebhook = async (req, res, next) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const intent = event.data.object;
        const metadata = intent.metadata || {};
        const order_id = metadata.order_id;
        const user_id = metadata.user_id;

        const paymentFilter = order_id
          ? { orderId: order_id }
          : { stripe_payment_intent_id: intent.id };

        await Payment.updateOne(paymentFilter, {
          $set: {
            status: "success",
            updatedAt: new Date(),
            stripe_payment_intent_id: intent.id,
          },
        });

        // ✅ Update order if we know it
        if (order_id) {
          const order = await Order.findOne({ order_id });
          if (order) {
            order.status = "PLACED";
            await order.save();

            // ✅ Ensure ticket exists
            let ticket = await Ticket.findOne({ order_id: order.order_id });
            if (!ticket) {
              ticket = await Ticket.create({
                ticket_id: generateTicketId(),
                order_id: order.order_id,
                user_id,
                status: "OPEN",
              });

              if (req.app?.get) {
                const io = req.app.get("io");
                if (io) {
                  io.to("order.order_id").emit("ticket.created", { ticket });
                  // io.to(`${user_id}`).emit("ticket.created", { ticket });
                }
              }
            }
          }
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        const metadata = intent.metadata || {};
        const order_id = metadata.order_id;

        const paymentFilter = order_id
          ? { orderId: order_id }
          : { stripe_payment_intent_id: intent.id };

        await Payment.updateOne(paymentFilter, {
          $set: {
            status: "failed",
            updatedAt: new Date(),
            stripe_payment_intent_id: intent.id,
          },
        });
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("⚠️ Webhook error:", error);
    res.status(500).send("Webhook handler failed");
  }
};
