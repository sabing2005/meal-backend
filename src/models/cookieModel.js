import mongoose from "mongoose";

const cookieSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false,
      trim: true,
      default: "Uber Eats SID Cookie"
    },
    description: {
      type: String,
      required: false,
      trim: true,
      default: ""
    },
    cookie_value: {
      type: String,
      required: [true, "Cookie value is required"],
      trim: true,
      minLength: [10, "Cookie value must be at least 10 characters long"],
      maxLength: [2000, "Cookie value cannot exceed 2000 characters"],
      validate: {
        validator: function(v) {
          return v && v.trim().length >= 10;
        },
        message: "Cookie value must be at least 10 characters and cannot be empty"
      }
    },
    isActive: {
      type: Boolean,
      default: false,
      index: true
    },
    lastUsed: {
      type: Date,
      default: null
    },
    usageCount: {
      type: Number,
      default: 0
    },
    expiresAt: {
      type: Date,
      default: null
    },
    isValid: {
      type: Boolean,
      default: true
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);


// Virtual for id
const virtual = cookieSchema.virtual("id");
virtual.get(function () {
  return this._id;
});

cookieSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    delete ret._id;
    if (ret.cookie_value) {
      ret.cookie_preview = ret.cookie_value.substring(0, 20) + "...";
      delete ret.cookie_value;
    }
  },
});

cookieSchema.methods.getCookieValue = function () {
  return this.cookie_value;
};

cookieSchema.statics.getActiveCookie = async function () {
  return await this.findOne({ isActive: true, isValid: true });
};

cookieSchema.statics.getActiveCookies = async function () {
  return await this.find({ isActive: true, isValid: true });
};

cookieSchema.statics.activateCookie = async function (cookieId) {
  const cookie = await this.findByIdAndUpdate(
    cookieId,
    { $set: { isActive: true } },
    { new: true }
  );
  return cookie;
};

const Cookie = mongoose.model("Cookie", cookieSchema);

export default Cookie;

