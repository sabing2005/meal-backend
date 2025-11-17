import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      select: false,
    },
    isActive: { type: Boolean, default: true },
    role: {
      type: String,
      enum: ["user", "staff", "admin"],
      default: "user",
      index: true,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    isVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
  },
  { timestamps: true }
);

const virtual = userSchema.virtual("id");
virtual.get(function () {
  return this._id;
});

userSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
  },
});
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getJWTToken = function () {
  const userObject = this.toObject();

  return jwt.sign(
    { id: this._id, ...userObject },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};


userSchema.methods.setResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
  return resetToken;
};

userSchema.methods.setEmailVerificationToken = function () {
  const verifyToken = crypto.randomBytes(20).toString("hex");
  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000; // 24h
  return verifyToken;
};

const User = mongoose.model("User", userSchema);

export default User;
