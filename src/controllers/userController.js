import catchAsyncErrors from "../middlewares/catchAsyncErrors.js";
import User from "../models/userModel.js";

export const updateProfile = catchAsyncErrors(async (req, res, next) => {
  const userID = req.user.id;
  const user = await User.findByIdAndUpdate(userID, req.body, { new: true });
  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    data: user,
  });
});
