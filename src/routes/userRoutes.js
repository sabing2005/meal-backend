import express from "express";
import { isAuthenticatedUser } from "../middlewares/auth.js";
import {
  updateProfile,
} from "../controllers/userController.js";

const router = express.Router();

router.put("/update/profile", isAuthenticatedUser, updateProfile);
export default router;
