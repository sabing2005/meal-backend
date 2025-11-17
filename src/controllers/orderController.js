import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import Order from "../models/orderModel.js";
import mongoose from "mongoose";
import Payment from "../models/paymentModel.js";
import Ticket from "../models/ticketModel.js";

export const getUserOrdersHistory = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 20, q, status } = req.query || {};
  const userObjectId = new mongoose.Types.ObjectId(req.user.id);
  const skip = (Number(page) - 1) * Number(limit);
  const searchRegex = q ? new RegExp(`${q}`, "i") : null;

  const baseMatch = { user_id: userObjectId };
  if (status) baseMatch.status = status;

  const pipeline = [
    { $match: baseMatch },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "payments",
        let: { ref: "$order_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$orderId", "$$ref"] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 1 },
          { $project: { _id: 0, method: 1, status: 1, amount: 1 } },
        ],
        as: "payment",
      },
    },
    { $unwind: { path: "$payment", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "tickets",
        let: { ref: "$order_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$order_id", "$$ref"] } } },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { _id: 0, ticket_id: 1, status: 1, claimed_by: 1 } },
        ],
        as: "ticket",
      },
    },
    { $unwind: { path: "$ticket", preserveNullAndEmptyArrays: true } },
  ];

  if (searchRegex) {
    pipeline.push({
      $match: {
        $or: [
          { order_id: { $regex: searchRegex } },
          { cart_url: { $regex: searchRegex } },
        ],
      },
    });
  }

  const countPipeline = [...pipeline, { $count: "total" }];

  pipeline.push(
    { $skip: skip },
    { $limit: Number(limit) },
    {
      $project: {
        _id: 1,
        order_id: 1,
        link: "$cart_url",
        createdAt: 1,
        amount: "$payment.amount",
        payment: "$payment.method",
        order_status: {
          $cond: [
            { $eq: ["$status", "DELIVERED"] },
            "PLACED",
            "$status"
          ]
        },
        payment_status: "$payment.status",
        ticket: "$ticket",
        discount: {
          $switch: {
            branches: [
              {
                case: { $eq: ["$payment.method", "solana"] },
                then: "$pricing_options.sol.discount_percent",
              },
              {
                case: { $eq: ["$payment.method", "token"] },
                then: "$pricing_options.spl.discount_percent",
              },
              {
                case: { $eq: ["$payment.method", "card"] },
                then: "$pricing_options.card.discount_percent",
              },
            ],
            default: null,
          },
        },
      },
    }
  );

  const [rows, totalAgg] = await Promise.all([
    Order.aggregate(pipeline),
    Order.aggregate(countPipeline),
  ]);

  const total = totalAgg[0]?.total || 0;

  res.json({
    success: true,
    message: "Order history fetched",
    data: { total, page: Number(page), limit: Number(limit), orders: rows },
  });
});

export const getOrderById = catchAsyncErrors(async (req, res, next) => {
  const id = req.params.id;

  const order = await Order.findById(id)
    .populate("user_id", "name email") // user info
    .lean();

  const payment = await Payment.findOne({ orderId: id }).lean();
  const tickets = await Ticket.find({ order_id: id }).lean();

  // Normalize DELIVERED status to PLACED in response
  if (order && order.status === "DELIVERED") {
    order.status = "PLACED";
  }

  res.json({
    data: {
      order,
      payment,
      tickets,
    },
  });
});

export const getUserOrdersAnalytics = catchAsyncErrors(
  async (req, res, next) => {
    const userObjectId = new mongoose.Types.ObjectId(req.user.id);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const rows = await Order.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: { $in: ["PLACED", "DELIVERED", "FULFILLED"] },
        },
      },
      {
        $lookup: {
          from: "payments",
          let: { ref: "$order_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$orderId", "$$ref"] } } },
            { $sort: { updatedAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, method: 1, status: 1 } },
          ],
          as: "payment",
        },
      },
      { $unwind: { path: "$payment", preserveNullAndEmptyArrays: false } },
      { $match: { "payment.status": { $in: ["pending", "success"] } } },
      {
        $project: {
          createdAt: 1,
          discount_amount: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$payment.method", "solana"] },
                  then: "$pricing_options.sol.discount_amount",
                },
                {
                  case: { $eq: ["$payment.method", "token"] },
                  then: "$pricing_options.spl.discount_amount",
                },
                {
                  case: { $eq: ["$payment.method", "card"] },
                  then: "$pricing_options.card.discount_amount",
                },
              ],
              default: 0,
            },
          },
          isMonth: {
            $and: [
              { $gte: ["$createdAt", startOfMonth] },
              { $lt: ["$createdAt", startOfNextMonth] },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          lifetimeSavings: { $sum: "$discount_amount" },
          monthSavings: {
            $sum: { $cond: ["$isMonth", "$discount_amount", 0] },
          },
          ordersCount: { $sum: 1 },
        },
      },
    ]);

    const result = rows[0] || {
      lifetimeSavings: 0,
      monthSavings: 0,
      ordersCount: 0,
    };

    res.json({
      success: true,
      message: "Analytics fetched",
      data: {
        total_savings: result.lifetimeSavings,
        savings_this_month: result.monthSavings,
        orders_count: result.ordersCount,
      },
    });
  }
);
export const DashboardStats = catchAsyncErrors(async (req, res, next) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const rows = await Order.aggregate([
    {
      $match: {
        status: { $in: ["PLACED", "DELIVERED", "FULFILLED"] },
      },
    },
    {
      $lookup: {
        from: "payments",
        let: { ref: "$order_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$reference", "$$ref"] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 1 },
          { $project: { _id: 0, method: 1, status: 1, amount: 1 } },
        ],
        as: "payment",
      },
    },
    { $unwind: { path: "$payment", preserveNullAndEmptyArrays: false } },
    { $match: { "payment.status": "success" } },
    {
      $facet: {
        totalVolume: [
          { $group: { _id: null, total: { $sum: "$payment.amount" } } },
        ],
        todayOrders: [
          {
            $match: { createdAt: { $gte: startOfToday, $lte: endOfToday } },
          },
          { $count: "count" },
        ],
        paymentRatio: [
          { $group: { _id: "$payment.method", count: { $sum: 1 } } },
        ],
      },
    },
  ]);

  const data = rows[0] || {};

  const totalVolume = data.totalVolume?.[0]?.total || 0;
  const todayOrders = data.todayOrders?.[0]?.count || 0;

  let solCount = 0;
  let splCount = 0;
  (data.paymentRatio || []).forEach((row) => {
    if (row._id === "solana") solCount = row.count;
    else if (row._id === "token") splCount = row.count;
  });

  res.json({
    success: true,
    message: "Dashboard stats fetched",
    data: {
      total_volume: totalVolume,
      today_orders: todayOrders,
      solana: solCount,
      spl: splCount,
    },
  });
});
