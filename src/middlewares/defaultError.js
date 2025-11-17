import ErrorHandler from "../utils/errorHandler.js";

export default (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.message = err.message || "Internal Server Error";

  if (err.name === "CastError") {
    const message = `Resource not found. Invalid: ${err.path}`;
    err = new ErrorHandler(message, 401);
  }

  if (err.code === 11000) {
    const message = `${Object.keys(
      err.keyValue
    )} already exists.`;
    err = new ErrorHandler(message, 401);
  }

  if (err.name === "JSONWebTokenError") {
    const message = `JSON Web Token is invalid. Try again.`;
    err = new ErrorHandler(message, 401);
  }

  if (err.name === "TokenExpiredError") {
    const message = `JSON Web Token has expired. Try again.`;
    err = new ErrorHandler(message, 401);
  }

  res.status(err.statusCode).json({ success: false, message: err.message });
};
