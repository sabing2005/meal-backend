import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import User from "../models/userModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";
import Payment from "../models/paymentModel.js";
import sendEmail from "../utils/sendEmail.js";
import { name } from "ejs";

export const promoteToAdminStaff = catchAsyncErrors(async (req, res, next) => {
  const { userId, email, username } = req.body || {};

  if (!userId && !email && !username) {
    return next(new ErrorHandler("Provide userId or email or username", 400));
  }

  const user = await User.findOne(
    userId ? { _id: userId } : email ? { email } : { username }
  );

  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }

  if (user.role === "admin") {
    return next(
      new ErrorHandler("Admin role cannot be downgraded via this endpoint", 400)
    );
  }

  user.role = "admin_staff";
  const saved = await user.save();

  res.json({
    success: true,
    message: "User promoted to admin_staff",
    data: saved,
  });
});

export const promoteToAdmin = catchAsyncErrors(async (req, res, next) => {
  const { userId, email, username } = req.body || {};

  if (!userId && !email && !username) {
    return next(new ErrorHandler("Provide userId or email or username", 400));
  }

  const user = await User.findOne(
    userId ? { _id: userId } : email ? { email } : { username }
  );

  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }

  user.role = "admin";
  const saved = await user.save();

  res.json({ success: true, message: "User promoted to admin", data: saved });
});

export const listUsers = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 5, q, active, role } = req.query || {};
  const filter = {};

  if (role) {
    const roles = role.split(",").map((r) => r.trim());
    const allowedRoles = ["user", "staff", "admin"];
    const validRoles = roles.filter((r) => allowedRoles.includes(r));

    if (validRoles.length > 0) {
      filter.role = { $in: validRoles };
    }
  }

  if (typeof q === "string" && q.trim()) {
    filter.email = { $regex: new RegExp(q.trim(), "i") };
  }
  if (typeof active !== "undefined") {
    filter.isActive = String(active).toLowerCase() === "true";
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [rows, total] = await Promise.all([
    User.find(filter)
      .select("name email role isActive isVerified createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);
  res.json({
    success: true,
    message: "Users fetched",
    data: { total, page: Number(page), limit: Number(limit), users: rows },
  });
});

// Keep listStaffs for backward compatibility
export const listStaffs = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 5, q, active, role } = req.query || {};
  const filter = { role: "staff" }; // Default to staff role

  // Override role filter if provided
  if (role && ["user", "staff", "admin"].includes(role)) {
    filter.role = role;
  }

  if (typeof q === "string" && q.trim()) {
    filter.email = { $regex: new RegExp(q.trim(), "i") };
  }
  if (typeof active !== "undefined") {
    filter.isActive = String(active).toLowerCase() === "true";
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [rows, total] = await Promise.all([
    User.find(filter)
      .select("name email role isActive isVerified createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);
  res.json({
    success: true,
    message: "Staffs fetched",
    data: { total, page: Number(page), limit: Number(limit), staffs: rows },
  });
});

export const activateStaff = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findOne({ _id: userId, role: "staff" });
  if (!user) return next(new ErrorHandler("Staff not found", 404));
  user.isActive = true;
  await user.save();
  res.json({
    success: true,
    message: "Staff activated",
    data: {
      id: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
});

export const deactivateStaff = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findOne({ _id: userId, role: "staff" });
  if (!user) return next(new ErrorHandler("Staff not found", 404));
  user.isActive = false;
  await user.save();
  res.json({
    success: true,
    message: "Staff deactivated",
    data: {
      id: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
});

// GET /api/v1/admin/orders
// auth: isAuthenticatedUser + authorizeRole('admin')
export const listAdminOrders = catchAsyncErrors(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    q,
    payment,
    staff, // claimed_by userId
    from,
    to,
    sort = "createdAt:desc",
  } = req.query || {};

  const skip = (Number(page) - 1) * Number(limit);

  // base match
  const match = {};
  if (status) match.status = status;
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }
  const searchRegex = q ? new RegExp(q, "i") : null;

  // sort parsing
  const [sortField, sortDir] = String(sort).split(":");
  const sortStage = {
    [sortField || "createdAt"]: sortDir === "asc" ? 1 : -1,
  };

  const pipeline = [
    { $match: match },

    // customer email lookup
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "customer",
        pipeline: [{ $project: { _id: 0, email: 1, name: 1 } }],
      },
    },
    { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },

    // search in order_id, cart_url, and customer email
    ...(searchRegex
      ? [
          {
            $match: {
              $or: [
                { order_id: { $regex: searchRegex } },
                { cart_url: { $regex: searchRegex } },
                { "customer.email": { $regex: searchRegex } },
              ],
            },
          },
        ]
      : []),

    // latest payment
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

    // filter by payment method if asked
    ...(payment ? [{ $match: { "payment.method": payment } }] : []),

    // ticket for assignment
    {
      $lookup: {
        from: "tickets",
        localField: "order_id",
        foreignField: "order_id",
        as: "ticket",
        pipeline: [{ $project: { _id: 1, ticket_id: 1, claimed_by: 1 } }],
      },
    },
    { $unwind: { path: "$ticket", preserveNullAndEmptyArrays: true } },

    // filter by assigned staff if asked
    ...(staff
      ? [
          {
            $match: { "ticket.claimed_by": new mongoose.Types.ObjectId(staff) },
          },
        ]
      : []),

    // staff user
    {
      $lookup: {
        from: "users",
        localField: "ticket.claimed_by",
        foreignField: "_id",
        as: "staff",
        pipeline: [{ $project: { _id: 1, email: 1, name: 1 } }],
      },
    },
    { $unwind: { path: "$staff", preserveNullAndEmptyArrays: true } },

    // 🔥 lookup unread messages count
    {
      $lookup: {
        from: "chatmessages",
        let: { tId: "$ticket._id", claimed: "$ticket.claimed_by" },
        pipeline: [
          { $match: { $expr: { $eq: ["$ticket_id", "$$tId"] } } },
          { $match: { isInternal: { $ne: true } } }, // skip internal notes
          {
            $match: {
              $expr: {
                $cond: [
                  { $ifNull: ["$$claimed", false] }, // if ticket is claimed
                  {
                    $and: [
                      { $ne: ["$sender_id", "$$claimed"] }, // not sent by staff
                      {
                        $not: [
                          { $in: ["$$claimed", { $ifNull: ["$readBy", []] }] },
                        ],
                      }, // staff has not read
                    ],
                  },
                  {
                    // unclaimed case → unread if nobody read
                    $eq: [{ $size: { $ifNull: ["$readBy", []] } }, 0],
                  },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "unreadMessages",
      },
    },
    {
      $addFields: {
        unread_messages: {
          $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0],
        },
      },
    },
    {
      $addFields: {
        unread_messages: {
          $ifNull: [{ $arrayElemAt: ["$unreadMessages.count", 0] }, 0],
        },
      },
    },

    // compute discount percent
    {
      $addFields: {
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
    },

    // sorting
    { $sort: sortStage },

    // projection for UI row
    {
      $project: {
        _id: 1,
        order_id: 1,
        timestamp: "$createdAt",
        customer_email: "$customer.email",
        customer_name: "$customer.name",
        amount: "$payment.amount",
        payment: "$payment.method",
        discount: 1,
        status: {
          $cond: [
            { $eq: ["$status", "DELIVERED"] },
            "PLACED",
            "$status"
          ]
        },
        assigned_staff: {
          $cond: [
            { $ifNull: ["$staff._id", false] },
            {
              id: "$staff._id",
              email: "$staff.email",
              name: "$staff.name",
            },
            null,
          ],
        },
        cart_link: "$cart_url",
        unread_messages: 1, // 👈 added
      },
    },

    // pagination
    { $skip: skip },
    { $limit: Number(limit) },
  ];

  const countPipeline = [
    ...pipeline.slice(
      0,
      pipeline.findIndex((s) => "$project" in s) > -1
        ? pipeline.findIndex((s) => "$project" in s)
        : pipeline.length
    ),
    { $count: "total" },
  ];

  const [rows, totalAgg] = await Promise.all([
    Order.aggregate(pipeline),
    Order.aggregate(countPipeline),
  ]);

  const total = totalAgg[0]?.total || 0;

  res.json({
    success: true,
    message: "Orders fetched",
    data: {
      total,
      page: Number(page),
      limit: Number(limit),
      orders: rows,
    },
  });
});

// Get all users (admin only)
export const getAllUsers = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 20, q, role, active } = req.query || {};
  const filter = {};

  if (typeof q === "string" && q.trim()) {
    filter.email = { $regex: new RegExp(q.trim(), "i") };
  }
  if (role) {
    filter.role = role;
  }
  if (typeof active !== "undefined") {
    filter.isActive = String(active).toLowerCase() === "true";
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [rows, total] = await Promise.all([
    User.find(filter)
      .select("email role isActive isVerified createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: "Users fetched",
    data: {
      total,
      page: Number(page),
      limit: Number(limit),
      users: rows,
    },
  });
});

// Activate user (admin only)
export const activateUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  user.isActive = true;
  await user.save();

  res.json({
    success: true,
    message: "User activated",
    data: {
      id: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
});

// Deactivate user (admin only)
export const deactivateUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  user.isActive = false;
  await user.save();

  res.json({
    success: true,
    message: "User deactivated",
    data: {
      id: user._id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
    },
  });
});

// Create new user (admin only)
export const createUser = catchAsyncErrors(async (req, res, next) => {
  const { name, email, role = "user" } = req.body || {};

  if (!email) {
    return next(new ErrorHandler("Email is required", 400));
  }

  // Validate role
  if (!["user", "staff", "admin"].includes(role)) {
    return next(
      new ErrorHandler("Invalid role. Must be user, staff, or admin", 400)
    );
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorHandler("User with this email already exists", 400));
  }

  // Generate random password
  const randomPassword =
    Math.random().toString(36).slice(-8) +
    Math.random().toString(36).slice(-8).toUpperCase() +
    "123";

  const user = new User({
    name,
    email,
    password: randomPassword,
    role,
    isVerified: true, // Auto-verify admin created users
  });

  const saved = await user.save();

  // Send welcome email with generated password
  try {
    const loginUrl = `https://me.senew-tech.com/login`; // Adjust this URL as needed

    await sendEmail({
      email: saved.email,
      subject: `Welcome to MEAL - Your Account Has Been Created`,
      templatePath: "src/templates/userCreated.ejs",
      templateData: {
        appName: "MEAL",
        userName: saved.name || saved.email,
        userEmail: saved.email,
        userRole: saved.role,
        generatedPassword: randomPassword,
        loginUrl: loginUrl,
      },
    });
  } catch (emailError) {
    console.error("Error sending welcome email:", emailError);
    // Don't fail the user creation if email fails
  }

  res.status(201).json({
    success: true,
    message: "User created successfully and welcome email sent",
    data: {
      id: saved._id,
      name: saved.name,
      email: saved.email,
      role: saved.role,
      isActive: saved.isActive,
      isVerified: saved.isVerified,
      createdAt: saved.createdAt,
      generatedPassword: randomPassword, // Include generated password in response
    },
  });
});

// Create new staff member (admin only) - kept for backward compatibility
export const createStaff = catchAsyncErrors(async (req, res, next) => {
  const { email, password, confirmPassword } = req.body || {};

  if (!email || !password || !confirmPassword) {
    return next(
      new ErrorHandler("Email, password and confirm password are required", 400)
    );
  }

  if (password !== confirmPassword) {
    return next(
      new ErrorHandler("Password does not match with confirm password", 400)
    );
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorHandler("User with this email already exists", 400));
  }

  const user = new User({
    email,
    password,
    role: "staff",
    isVerified: true, // Auto-verify staff members
  });

  const saved = await user.save();

  res.status(201).json({
    success: true,
    message: "Staff member created successfully",
    data: {
      id: saved._id,
      email: saved.email,
      role: saved.role,
      isActive: saved.isActive,
      isVerified: saved.isVerified,
      createdAt: saved.createdAt,
    },
  });
});

// Update user details (admin only)
export const updateUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const { name, email, role, isActive } = req.body || {};

  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  // Update name if provided
  if (name !== undefined) {
    user.name = name;
  }

  // Update email if provided
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorHandler("Email already exists", 400));
    }
    user.email = email;
  }

  // Update role if provided
  if (role && ["user", "staff", "admin"].includes(role)) {
    user.role = role;
  } else if (role && !["user", "staff", "admin"].includes(role)) {
    return next(
      new ErrorHandler("Invalid role. Must be user, staff, or admin", 400)
    );
  }

  // Update active status if provided
  if (typeof isActive === "boolean") {
    user.isActive = isActive;
  }

  await user.save();

  res.json({
    success: true,
    message: "User updated successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// Update staff member details (admin only) - kept for backward compatibility
export const updateStaff = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const { name, email, role, isActive } = req.body || {};

  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("Staff member not found", 404));

  if (user.role !== "staff") {
    return next(new ErrorHandler("User is not a staff member", 400));
  }

  // Update name if provided
  if (name !== undefined) {
    user.name = name;
  }

  // Update email if provided
  if (email && email !== user.email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(new ErrorHandler("Email already exists", 400));
    }
    user.email = email;
  }

  // Update role if provided
  if (role && ["user", "staff", "admin"].includes(role)) {
    user.role = role;
  } else if (role && !["user", "staff", "admin"].includes(role)) {
    return next(
      new ErrorHandler("Invalid role. Must be user, staff, or admin", 400)
    );
  }

  // Update active status if provided
  if (typeof isActive === "boolean") {
    user.isActive = isActive;
  }

  await user.save();

  res.json({
    success: true,
    message: "Staff member updated successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// Delete user (admin only)
export const deleteUser = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  await User.findByIdAndDelete(userId);

  res.json({
    success: true,
    message: "User deleted successfully",
  });
});

// Delete staff member (admin only) - kept for backward compatibility
export const deleteStaff = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("Staff member not found", 404));

  if (user.role !== "staff") {
    return next(new ErrorHandler("User is not a staff member", 400));
  }

  await User.findByIdAndDelete(userId);

  res.json({
    success: true,
    message: "Staff member deleted successfully",
  });
});

// Change user password (admin only)
export const changeUserPassword = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return next(
      new ErrorHandler("Old password and new password are required", 400)
    );
  }

  if (newPassword.length < 6) {
    return next(
      new ErrorHandler("New password must be at least 6 characters long", 400)
    );
  }

  if (oldPassword === newPassword) {
    return next(
      new ErrorHandler("New password must be different from old password", 400)
    );
  }

  const user = await User.findById(userId).select("+password");
  if (!user) return next(new ErrorHandler("User not found", 404));

  // Verify old password
  const isOldPasswordValid = await user.comparePassword(oldPassword);
  if (!isOldPasswordValid) {
    return next(new ErrorHandler("Old password is incorrect", 400));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: "Password changed successfully",
    data: {
      id: user._id,
      email: user.email,
      role: user.role,
    },
  });
});

// Get user by ID (admin only)
export const getUserById = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  res.json({
    success: true,
    message: "User retrieved successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// Get staff member by ID (admin only) - kept for backward compatibility
export const getStaffById = catchAsyncErrors(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId);
  if (!user) return next(new ErrorHandler("User not found", 404));

  if (user.role !== "staff") {
    return next(new ErrorHandler("User is not a staff member", 400));
  }

  res.json({
    success: true,
    message: "Staff member retrieved successfully",
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// @desc    Get dashboard overview (total volume + today's orders)
// @route   GET /api/v1/admin/dashboard/overview
// @access  Admin, Staff
export const getDashboardOverview = catchAsyncErrors(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow

  // Get total volume from successful payments
  const totalVolumeResult = await Payment.aggregate([
    {
      $match: {
        status: "success", // Only count successful payments
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  // Get today's orders count that have successful payments
  const todaySuccessfulOrdersCount = await Payment.countDocuments({
    status: "success",
    createdAt: {
      $gte: today,
      $lt: tomorrow,
    },
  });

  res.json({
    success: true,
    message: "Dashboard overview fetched successfully",
    data: {
      totalVolume:
        totalVolumeResult.length > 0 ? totalVolumeResult[0].totalAmount : 0,
      todaySuccessfulOrdersCount,
      currency: "USD",
      date: today.toISOString().split("T")[0], // YYYY-MM-DD format
    },
  });
});

// @desc    Get orders for current month with month/year filtering
// @route   GET /api/v1/admin/orders/monthly?month=9&year=2025&page=1&limit=10
// @access  Admin, Staff
export const getMonthlyOrders = catchAsyncErrors(async (req, res, next) => {
  const { month, year, page = 1, limit = 10, status } = req.query || {};

  // Use current month/year if not provided
  const currentDate = new Date();
  const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1; // getMonth() returns 0-11
  const targetYear = year ? parseInt(year) : currentDate.getFullYear();

  // Create date range for the month
  const startDate = new Date(targetYear, targetMonth - 1, 1); // month is 0-indexed
  const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999); // Last day of month

  // Build filter
  const filter = {
    createdAt: {
      $gte: startDate,
      $lte: endDate,
    },
  };

  // Add status filter if provided
  if (status) {
    filter.status = status;
  }

  // Calculate pagination
  const skip = (Number(page) - 1) * Number(limit);

  // Get orders with pagination
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select("order_id total status createdAt paymentMethod")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(filter),
  ]);

  // Get payment info for each order
  const ordersWithPayments = await Promise.all(
    orders.map(async (order) => {
      const payment = await Payment.findOne({ orderId: order.order_id });
      return {
        order_id: order.order_id,
        total: order.total,
        status: order.status === "DELIVERED" ? "PLACED" : order.status,
        paymentMethod: payment?.method || "unknown",
        token:
          payment?.method === "solana"
            ? "SOL"
            : payment?.method === "token"
            ? "SPL"
            : "Card",
        createdAt: order.createdAt,
        paymentStatus: payment?.status || "unknown",
      };
    })
  );

  res.json({
    success: true,
    message: `Orders for ${targetMonth}/${targetYear} fetched successfully`,
    data: {
      orders: ordersWithPayments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
      filter: {
        month: targetMonth,
        year: targetYear,
        status: status || "all",
      },
    },
  });
});

// @desc    Get daily volume (money count) for past week with date range filtering
// @route   GET /api/v1/admin/dashboard/weekly-volume?startDate=2025-09-07&endDate=2025-09-13
// @access  Admin, Staff
export const getWeeklyVolume = catchAsyncErrors(async (req, res, next) => {
  const { startDate, endDate } = req.query || {};

  // Default to past week if no dates provided
  let start, end;

  if (startDate && endDate) {
    start = new Date(startDate);
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of day
  } else {
    // Default to previous week (week before current week)
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Calculate start of current week (Monday)
    const startOfCurrentWeek = new Date(today);
    startOfCurrentWeek.setDate(today.getDate() - currentDayOfWeek + 1); // Monday
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    // Previous week = 7 days before start of current week
    end = new Date(startOfCurrentWeek);
    end.setDate(startOfCurrentWeek.getDate() - 1); // Sunday of previous week
    end.setHours(23, 59, 59, 999);

    start = new Date(startOfCurrentWeek);
    start.setDate(startOfCurrentWeek.getDate() - 7); // Monday of previous week
    start.setHours(0, 0, 0, 0);
  }

  // Get daily volume data
  const dailyVolume = await Payment.aggregate([
    {
      $match: {
        status: "success",
        createdAt: {
          $gte: start,
          $lte: end,
        },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
          dayOfWeek: { $dayOfWeek: "$createdAt" },
        },
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
    },
  ]);

  // Create array for all days in range
  const daysInRange = [];
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dayData = dailyVolume.find(
      (d) =>
        d._id.year === currentDate.getFullYear() &&
        d._id.month === currentDate.getMonth() + 1 &&
        d._id.day === currentDate.getDate()
    );

    daysInRange.push({
      date: currentDate.toISOString().split("T")[0], // YYYY-MM-DD
      dayOfWeek: currentDate.toLocaleDateString("en-US", { weekday: "short" }), // Mon, Tue, etc.
      volume: dayData ? dayData.totalAmount : 0,
      count: dayData ? dayData.count : 0,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Calculate total volume for the period
  const totalVolume = dailyVolume.reduce(
    (sum, day) => sum + day.totalAmount,
    0
  );
  const totalCount = dailyVolume.reduce((sum, day) => sum + day.count, 0);

  res.json({
    success: true,
    message: "Weekly volume data fetched successfully",
    data: {
      dailyVolume: daysInRange,
      dateRange: {
        startDate: start.toISOString().split("T")[0],
        endDate: end.toISOString().split("T")[0],
        days: daysInRange.length,
      },
      currency: "USD",
    },
  });
});

// @desc    Debug API to check all payment data
// @route   GET /api/v1/admin/debug/payments
// @access  Admin, Staff
export const debugPayments = catchAsyncErrors(async (req, res, next) => {
  const allPayments = await Payment.find({})
    .select("amount status method createdAt orderId")
    .sort({ createdAt: -1 })
    .limit(50);

  const paymentStats = await Payment.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  res.json({
    success: true,
    message: "Payment debug data fetched",
    data: {
      recentPayments: allPayments,
      paymentStats,
      totalPayments: allPayments.length,
    },
  });
});

// @desc    Update order status
// @route   PATCH /api/v1/admin/orders/:orderId/status
// @access  Admin, Staff
export const updateOrderStatus = catchAsyncErrors(async (req, res, next) => {
  const { orderId } = req.params;
  const { status } = req.body || {};

  // Validate status
  const allowedStatuses = [
    "PENDING",
    "PLACED",
    "CANCELLED",
    "REFUNDED",
    "DELIVERED", // Keep for backward compatibility
  ];
  if (!status || !allowedStatuses.includes(status)) {
    return next(
      new ErrorHandler(
        "Invalid status. Must be one of: PENDING, PLACED, CANCELLED, REFUNDED, DELIVERED",
        400
      )
    );
  }

  // Find and update the order
  const order = await Order.findOne({ order_id: orderId });
  if (!order) {
    return next(new ErrorHandler("Order not found", 404));
  }

  const oldStatus = order.status;
  order.status = status;
  await order.save();

  res.json({
    success: true,
    message: "Order status updated successfully",
    data: {
      order_id: order.order_id,
      old_status: oldStatus,
      new_status: status,
      updated_at: order.updatedAt,
    },
  });
});

// @desc    Get all staff members
// @route   GET /api/v1/admin/staff
// @access  Admin, Staff
export const getAllStaff = catchAsyncErrors(async (req, res, next) => {
  const { page = 1, limit = 50, active } = req.query || {};

  // Build filter for staff members
  const filter = {
    role: { $in: ["staff", "admin"] }, // Include both staff and admin
  };

  // Add active filter if provided
  if (typeof active !== "undefined") {
    filter.isActive = String(active).toLowerCase() === "true";
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [staff, total] = await Promise.all([
    User.find(filter)
      .select("_id name email role isActive isVerified createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    message: "Staff members fetched successfully",
    data: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / Number(limit)),
      count: staff.length,
      staff: staff.map((member) => ({
        id: member._id,
        name: member.name,
        email: member.email,
        role: member.role,
        isActive: member.isActive,
        isVerified: member.isVerified,
        createdAt: member.createdAt,
      })),
    },
  });
});
