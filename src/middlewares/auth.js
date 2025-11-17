import User from "../models/userModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import catchAsyncErrors from "./catchAsyncErrors.js";
import jwt from "jsonwebtoken";

export const isAuthenticatedUser = catchAsyncErrors(async (req, res, next) => {
  const { authToken } = req.cookies;
  const authorizationHeader = req.headers.authorization;

  if (!authToken && !authorizationHeader) {
    return next(new ErrorHandler("Please login to access this resource.", 401));
  }

  let token;
  if (authorizationHeader && authorizationHeader.startsWith("Bearer")) {
    token = authorizationHeader.split(" ")[1];
  } else if (authToken) {
    token = authToken;
  }

  if (!token) {
    return next(new ErrorHandler("Please login to access this resource.", 401));
  }

  const decodedData = jwt.verify(token, process.env.JWT_SECRET);

  // Fetch user details from database to get role
  const user = await User.findById(decodedData.id).select("+password").lean();
  if (!user) {
    return next(new ErrorHandler("User not found.", 401));
  }
  if (!user?.isActive) {
    return next(new ErrorHandler("Your account has been deactivate", 401));
  }

  if (user.password != decodedData.password) {
    return next(new ErrorHandler("Please login to again.", 401));
  }

  req.user = {
    id: user._id,
    ...user,
  };

  next();
});

export const authorizeRole = (...roles) => {
  return (req, _, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new ErrorHandler(
          `Role ${req?.user?.role} is not allowed to access this resource.`,
          403
        )
      );
    }
    next();
  };
};
