import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../utils/errorHandler.js";
import sendEmail from "../utils/sendEmail.js";

export const contactSupport = catchAsyncErrors(async (req, res, next) => {
  const name = (req.body?.name || "").trim();
  const email = (req.body?.email || "").trim();
  const message = (req.body?.message || "").trim();

  if (!name || !email || !message) {
    return next(new ErrorHandler("name, email and message are required", 400));
  }
  if (name.length > 100) {
    return next(new ErrorHandler("name is too long", 400));
  }
  if (message.length > 2000) {
    return next(new ErrorHandler("message is too long", 400));
  }
  const to = process.env.SUPPORT_MAIL_TO || process.env.SMPT_MAIL;

  await sendEmail({
    email: to,
    subject: `[Support] Message from ${name} <${email}>`,
    templatePath: "src/templates/supportContact.ejs",
    templateData: {
      appName: "MEAL",
      name,
      email,
      message,
    },
  });

  res.json({ success: true, message: "Your message has been sent." });
});
