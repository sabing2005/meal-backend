import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import Cookie from "../models/cookieModel.js";

/**
 * Get all cookies (for admin/staff)
 * GET /api/v1/cookies?status=active (for active cookies)
 * GET /api/v1/cookies?status=inactive (for inactive cookies)
 * GET /api/v1/cookies (for all cookies)
 */
export const getAllCookies = catchAsyncErrors(async (req, res, next) => {
  const { status } = req.query;
  
  // Build query filter
  let query = {};
  if (status === "active") {
    query.isActive = true;
  } else if (status === "inactive") {
    query.isActive = false;
  }
  // If status is not provided or invalid, return all cookies

  const cookies = await Cookie.find(query).sort({ createdAt: -1 }).lean();

  // Include full cookie value for admin/staff
  const cookiesWithFullValue = cookies.map((cookie) => ({
    ...cookie,
    cookie_value: cookie.cookie_value, // Include full value
    cookie_preview: cookie.cookie_value
      ? cookie.cookie_value.substring(0, 20) + "..."
      : "",
  }));

  res.status(200).json({
    success: true,
    count: cookiesWithFullValue.length,
    cookies: cookiesWithFullValue,
    filter: status || "all", // Show what filter was applied
  });
});

/**
 * Create a new cookie
 * POST /api/v1/cookies
 */
export const createCookie = catchAsyncErrors(async (req, res, next) => {
  const { name, description, cookie_value, isActive, expiresAt, notes } = req.body;

  // Validation
  if (!cookie_value || cookie_value.trim().length === 0) {
    throw new ErrorHandler("Cookie value is required", 400);
  }

  if (cookie_value.trim().length < 10) {
    throw new ErrorHandler("Cookie value must be at least 10 characters long", 400);
  }

  if (cookie_value.trim().length > 2000) {
    throw new ErrorHandler("Cookie value cannot exceed 2000 characters", 400);
  }

  // If setting as active, deactivate others first
  let cookieData = {
    cookie_value: cookie_value.trim(),
  };

  // Optional fields
  if (name !== undefined && name !== null) cookieData.name = name;
  if (description !== undefined && description !== null) cookieData.description = description;
  if (expiresAt !== undefined && expiresAt !== null) cookieData.expiresAt = new Date(expiresAt);
  if (notes !== undefined && notes !== null) cookieData.notes = notes;

  const cookie = await Cookie.create(cookieData);

  // If isActive is true, activate this cookie (which will deactivate others)
  let finalCookie = cookie;
  if (isActive) {
    finalCookie = await Cookie.activateCookie(cookie._id);
  }

  res.status(201).json({
    success: true,
    message: "Cookie created successfully",
    cookie: {
      id: finalCookie._id,
      name: finalCookie.name,
      description: finalCookie.description,
      cookie_value: finalCookie.cookie_value, // Include full value for admin
      cookie_preview: finalCookie.cookie_value.substring(0, 20) + "...",
      isActive: finalCookie.isActive,
      lastUsed: finalCookie.lastUsed,
      usageCount: finalCookie.usageCount,
      expiresAt: finalCookie.expiresAt,
      isValid: finalCookie.isValid,
      notes: finalCookie.notes,
      createdAt: finalCookie.createdAt,
      updatedAt: finalCookie.updatedAt,
    },
  });
});

/**
 * Update a cookie
 * PUT /api/v1/cookies/:id
 */
export const updateCookie = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;
  const { name, description, cookie_value, expiresAt, notes, isValid } = req.body;

  const cookie = await Cookie.findById(id);

  if (!cookie) {
    throw new ErrorHandler("Cookie not found", 404);
  }

  // Validation for cookie_value if provided
  if (cookie_value !== undefined) {
    if (!cookie_value || cookie_value.trim().length === 0) {
      throw new ErrorHandler("Cookie value cannot be empty", 400);
    }
    if (cookie_value.trim().length < 10) {
      throw new ErrorHandler("Cookie value must be at least 10 characters long", 400);
    }
    if (cookie_value.trim().length > 2000) {
      throw new ErrorHandler("Cookie value cannot exceed 2000 characters", 400);
    }
    cookie.cookie_value = cookie_value.trim();
  }
  if (isValid !== undefined) cookie.isValid = isValid;
  
  // Optional fields
  if (name !== undefined) cookie.name = name;
  if (description !== undefined) cookie.description = description;
  if (expiresAt !== undefined) cookie.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (notes !== undefined) cookie.notes = notes;

  await cookie.save();

  res.status(200).json({
    success: true,
    message: "Cookie updated successfully",
    cookie: {
      id: cookie._id,
      name: cookie.name,
      description: cookie.description,
      cookie_value: cookie.cookie_value, // Include full value for admin
      cookie_preview: cookie.cookie_value.substring(0, 20) + "...",
      isActive: cookie.isActive,
      lastUsed: cookie.lastUsed,
      usageCount: cookie.usageCount,
      expiresAt: cookie.expiresAt,
      isValid: cookie.isValid,
      notes: cookie.notes,
      createdAt: cookie.createdAt,
      updatedAt: cookie.updatedAt,
    },
  });
});

/**
 * Activate a cookie (allows multiple active cookies)
 * PATCH /api/v1/cookies/:id/activate
 */
export const activateCookie = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const cookie = await Cookie.findById(id);

  if (!cookie) {
    throw new ErrorHandler("Cookie not found", 404);
  }

  if (!cookie.isValid) {
    throw new ErrorHandler("Cannot activate an invalid cookie", 400);
  }

  await Cookie.activateCookie(id);
  const updatedCookie = await Cookie.findById(id);

  res.status(200).json({
    success: true,
    message: "Cookie activated successfully",
    cookie: {
      id: updatedCookie._id,
      name: updatedCookie.name,
      description: updatedCookie.description,
      isActive: updatedCookie.isActive,
      cookie_preview: updatedCookie.cookie_value.substring(0, 20) + "...",
      lastUsed: updatedCookie.lastUsed,
      usageCount: updatedCookie.usageCount,
      expiresAt: updatedCookie.expiresAt,
      isValid: updatedCookie.isValid,
      notes: updatedCookie.notes,
      createdAt: updatedCookie.createdAt,
      updatedAt: updatedCookie.updatedAt,
    },
  });
});

/**
 * Deactivate a cookie
 * PATCH /api/v1/cookies/:id/deactivate
 */
export const deactivateCookie = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const cookie = await Cookie.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true }
  );

  if (!cookie) {
    throw new ErrorHandler("Cookie not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Cookie deactivated successfully",
    cookie: {
      id: cookie._id,
      name: cookie.name,
      description: cookie.description,
      isActive: cookie.isActive,
      cookie_preview: cookie.cookie_value.substring(0, 20) + "...",
      lastUsed: cookie.lastUsed,
      usageCount: cookie.usageCount,
      expiresAt: cookie.expiresAt,
      isValid: cookie.isValid,
      notes: cookie.notes,
      createdAt: cookie.createdAt,
      updatedAt: cookie.updatedAt,
    },
  });
});

/**
 * Delete a cookie
 * DELETE /api/v1/cookies/:id
 */
export const deleteCookie = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const cookie = await Cookie.findById(id);

  if (!cookie) {
    throw new ErrorHandler("Cookie not found", 404);
  }

  if (cookie.isActive) {
    throw new ErrorHandler(
      "Cannot delete an active cookie. Please deactivate it first.",
      400
    );
  }

  await Cookie.findByIdAndDelete(id);

  res.status(200).json({
    success: true,
    message: "Cookie deleted successfully",
  });
});

/**
 * Get a single cookie by ID
 * GET /api/v1/cookies/:id
 */
export const getCookieById = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  const cookie = await Cookie.findById(id);

  if (!cookie) {
    throw new ErrorHandler("Cookie not found", 404);
  }

  res.status(200).json({
    success: true,
    cookie: {
      id: cookie._id,
      name: cookie.name,
      description: cookie.description,
      cookie_value: cookie.cookie_value, // Include full value for admin/staff
      cookie_preview: cookie.cookie_value.substring(0, 20) + "...",
      isActive: cookie.isActive,
      lastUsed: cookie.lastUsed,
      usageCount: cookie.usageCount,
      expiresAt: cookie.expiresAt,
      isValid: cookie.isValid,
      notes: cookie.notes,
      createdAt: cookie.createdAt,
      updatedAt: cookie.updatedAt,
    },
  });
});

