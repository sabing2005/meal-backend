import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Order from "../models/orderModel.js";
import Payment from "../models/paymentModel.js";
import Ticket from "../models/ticketModel.js";
import { generateTicketId } from "../helpers/index.js";
import stripe from "../config/stripe.js";

export const createPaymentIntent = catchAsyncErrors(async (req, res, next) => {
  const { amount, currency = 'usd', order_id, orderId } = req.body;

  if (!amount) {
    return next(new ErrorHandler("Amount is required", 400));
  }

  console.log('🔍 Payment Intent Request:', {
    amount,
    currency,
    order_id: order_id || orderId,
    user_id: req.user?.id
  });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency,
      metadata: {
        order_id: order_id || orderId || '',
        user_id: req.user?.id ? String(req.user.id) : ''
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });
  } catch (error) {
    console.error('❌ Stripe payment intent creation error:', error);
    console.error('❌ Error details:', {
      message: error.message,
      type: error.type,
      code: error.code,
      decline_code: error.decline_code
    });
    
    return res.status(500).json({
      success: false,
      message: "Failed to create payment intent",
      error: error.message,
      details: {
        type: error.type,
        code: error.code
      }
    });
  }
});

export const simulatePayment = catchAsyncErrors(async (req, res, next) => {
  const { order_id, method = "card" } = req.body || {};

  if (!order_id) {
    return next(new ErrorHandler("order_id is required", 400));
  }

  const order = await Order.findOne({ order_id, user_id: req.user.id });
  if (!order) {
    return next(new ErrorHandler("Order not found", 404));
  }

  const methodKeyMap = { solana: "sol", token: "spl", card: "card" };
  const key = methodKeyMap[method];
  if (!key) {
    return next(
      new ErrorHandler("Invalid method. Use solana | token | card", 400)
    );
  }

  const amount = order.total
  const requestedMethod = method;
  const effectiveMethod =
    requestedMethod === "create" ? "card" : requestedMethod;

  const validMethods = ["solana", "card", "token"];
  if (!validMethods.includes(effectiveMethod)) {
    return next(
      new ErrorHandler(
        "Invalid method. Use solana | token | card ",
        400
      )
    );
  }

  const currency =
    effectiveMethod === "card"
      ? "usd"
      : effectiveMethod === "solana"
      ? "sol"
      : "usdc";

  let paymentData = {
    orderId: order.order_id,
    method: effectiveMethod,
    status: requestedMethod === "card" ? "pending" : "success",
    amount,
    currency: currency.toUpperCase(),
  };

  if (requestedMethod === "card") {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      metadata: { order_id: order.order_id, user_id: String(req.user.id) },
    });
    paymentData = {
      ...paymentData,
      stripe_client_secret: paymentIntent.client_secret,
      stripe_payment_intent_id: paymentIntent.id,
    };
  }

  await Payment.updateOne(
    { orderId: order.order_id },
    {
      $set: {
        amount,
        currency: currency.toUpperCase(),
        method: effectiveMethod,
        status: paymentData.status,
        stripe_payment_intent_id: paymentData.stripe_payment_intent_id,
        updatedAt: new Date(),
        orderId: order.order_id,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  order.status = "PLACED";
  await order.save();

  let ticket = await Ticket.findOne({ order_id: order.order_id });
  if (!ticket) {
    ticket = await Ticket.create({
      ticket_id: generateTicketId(),
      order_id: order.order_id,
      user_id: order.user_id,
      status: "OPEN",
    });
    if (req.app?.get) {
      const io = req.app.get("io");
      if (io) {
        io.to("staff:all").emit("ticket.created", {
          ticket_id: ticket.ticket_id,
          order_id: order.order_id,
          user_id: String(order.user_id),
          createdAt: ticket.createdAt,
        });
      }
    }
  }

  res.json({
    success: true,
    message:
      method === "card"
        ? "Stripe PaymentIntent created, order PLACED, ticket created if absent"
        : "Payment simulated, order PLACED, ticket created if absent",
    data: {
      order_id: order.order_id,
      status: order.status,
      payment: paymentData,
      ticket: { ticket_id: ticket.ticket_id, status: ticket.status },
    },
  });
});
