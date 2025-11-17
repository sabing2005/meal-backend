import express from "express";
import {
  createUser,
  signin,
  signout,
  forgotPassword,
  resetPassword,
  checkAuth,
  changePassword,
  verifyEmail,
  resendVerification,
} from "../controllers/authController.js";
import { isAuthenticatedUser} from "../middlewares/auth.js";

const router = express.Router();

router
  .post("/signup", createUser)
  .get("/check", isAuthenticatedUser, checkAuth)
  .post("/signin", signin)
  .get("/signout", signout)
  .post("/password/forgot", forgotPassword)
  .put("/password/reset/:token", resetPassword)
  .get("/email/verify/:token", verifyEmail)
  .post("/email/resend", resendVerification)
  .patch("/password/change", isAuthenticatedUser, changePassword);

export default router;
