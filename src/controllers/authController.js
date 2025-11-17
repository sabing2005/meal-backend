import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import User from "../models/userModel.js";
import ErrorHandler from "../utils/errorHandler.js";
import sendToken from "../utils/jWTToken.js";
import sendEmail from "../utils/sendEmail.js";
import crypto from "crypto";

export const checkAuth = catchAsyncErrors(async (req, res, next) => {
  if (req.user) {
    res.json(req.user);
  } else {
    res.sendStatus(401);
  }
});
export const createUser = catchAsyncErrors(async (req, res, next) => {
  const { email, password, confirmPassword, name } = req.body || {};

  if (!email) {
    return next(new ErrorHandler("Email is required", 400));
  }

  if (!password || !confirmPassword) {
    return next(
      new ErrorHandler("Password and confirm password are required", 400)
    );
  }
  if (password !== confirmPassword) {
    return next(
      new ErrorHandler("Password does not match with confirm password", 400)
    );
  }

  const user = new User({ email, password, name });
  const saved = await user.save();
  const verifyToken = saved.setEmailVerificationToken();
  await saved.save({ validateBeforeSave: false });
  const verifyUrl = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/auth/email/verify/${verifyToken}`;

  await sendEmail({
    email: saved.email,
    subject: "Verify your email",
    templatePath: "src/templates/verifyEmail.ejs",
    templateData: {
      appName: "MEAL",
      userName: saved.email,
      verifyUrl,
    },
  });
  return sendToken(user, 200, res);

  /* res.json({
    success: true,
    message: "User created. Verification email sent.",
    data: saved,
  }); */
});

export const signin = catchAsyncErrors(async (req, res, next) => {
  const { password, email } = req.body;
  if (!email || !password) {
    return next(new ErrorHandler("Please enter email and password", 400));
  }
  const user = await User.findOne({ email, isActive: true }).select(
    "+password"
  );
  if (!user) {
    return next(new ErrorHandler("Invalid Credentials", 401));
  }

  if (!user.isVerified) {
    return next(new ErrorHandler("Please verify your email to continue", 401));
  }

  const isPasswordMatched = await user.comparePassword(password);
  if (!isPasswordMatched) {
    return next(new ErrorHandler("Invalid Credentials", 401));
  }
  sendToken(user, 200, res);
});

export const signout = catchAsyncErrors(async (req, res, next) => {
  res.cookie("authToken", null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });
  res.json({
    success: true,
    message: "Signed Out Successfully",
  });
});

export const forgotPassword = catchAsyncErrors(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }
  const resetToken = user.setResetPasswordToken();
  const resetPasswordUrl = `https://me.senew-tech.com/reset-password?token=${resetToken}`;
  await user.save({ validateBeforeSave: false });
  try {
    await sendEmail({
      email: user.email,
      subject: "Forgot Password",
      templatePath: "src/templates/resetPassword.ejs",
      templateData: {
        appName: "MEAL",
        userName: user.email,
        resetPasswordUrl,
      },
    });
    res.json({
      success: true,
      message: "SUCCESS",
    });
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return next(new ErrorHandler(error.message, 500));
  }
});

export const resetPassword = catchAsyncErrors(async (req, res, next) => {
  const { password, confirmPassword } = req.body;
  const resetPasswordToken = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");
  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });
  if (!user) {
    return next(
      new ErrorHandler("Reset password token is invalid or has expired", 400)
    );
  }
  if (password !== confirmPassword) {
    return next(
      new ErrorHandler("Password does not match with confirm password", 400)
    );
  }
  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();
  res.json({
    success: true,
    message: "Reset Password Successfully",
  });
});

export const verifyEmail = catchAsyncErrors(async (req, res, next) => {
  const hashed = crypto
    .createHash("sha256")
    .update(req.params.token)
    .digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationExpire: { $gt: Date.now() },
  });

  if (!user) {
    return next(
      new ErrorHandler("Verification link is invalid or expired", 400)
    );
  }

  user.isVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpire = undefined;
  await user.save({ validateBeforeSave: false });

  return res.redirect("https://me.senew-tech.com/login");

  res.json({ success: true, message: "Email verified successfully" });
});

export const resendVerification = catchAsyncErrors(async (req, res, next) => {
  const { email } = req.body || {};

  if (!email) {
    return next(new ErrorHandler("Provide email", 400));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new ErrorHandler("User not found", 404));
  }

  if (user.isVerified) {
    return next(new ErrorHandler("User is already verified", 400));
  }

  const verifyToken = user.setEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  const verifyUrl = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/auth/email/verify/${verifyToken}`;

  await sendEmail({
    email: user.email,
    subject: "Verify your email",
    templatePath: "src/templates/verifyEmail.ejs",
    templateData: {
      appName: "MEAL",
      userName: user.email,
      verifyUrl,
    },
  });

  res.json({ success: true, message: "Verification email re-sent" });
});

export const changePassword = catchAsyncErrors(async (req, res, next) => {
  const { id } = req?.user || {};
  const { oldPassword, password } = req.body || {};

  const user = await User.findById(id).select("+password");

  if (!user) {
    return next(
      new ErrorHandler("User not found. Please login and try again.", 400)
    );
  }

  const isMatched = await user.comparePassword(oldPassword);

  if (!isMatched) {
    return next(
      new ErrorHandler("Please enter correct old password and try again.", 400)
    );
  }

  user.password = password;
  await user.save();

  res.json({
    success: true,
    message: "Password Changed Successfully",
  });
});
