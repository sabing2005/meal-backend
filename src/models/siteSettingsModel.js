import mongoose from "mongoose";

const SiteSettingsSchema = new mongoose.Schema(
    {
        ServiceAvavailable: {
            type: Boolean,
            default: true,
        },
        startTime: {
            type: String,
            default: "09:00",
        },
        endTime: {
            type: String,
            default: "22:00",
        },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

export const SiteSettings = mongoose.model("SiteSettings", SiteSettingsSchema);
