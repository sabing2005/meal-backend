import { SiteSettings } from "../models/siteSettingsModel.js";

// Upsert Site Settings
export const upsertSiteSettings = async (req, res) => {
  try {
    const { ServiceAvavailable, startTime, endTime } = req.body;
    const userId = req.user?._id || null; // assume auth middleware sets req.user

    // Build update object with only provided fields
    const updateFields = {
      updatedBy: userId,
    };

    if (ServiceAvavailable !== undefined) {
      updateFields.ServiceAvavailable = ServiceAvavailable;
    }
    if (startTime !== undefined) {
      updateFields.startTime = startTime;
    }
    if (endTime !== undefined) {
      updateFields.endTime = endTime;
    }

    const settings = await SiteSettings.findOneAndUpdate(
      {}, // global settings → only 1 doc
      {
        $set: updateFields,
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error upserting site settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to upsert site settings",
    });
  }
};

// Get Site Settings
export const getSiteSettings = async (req, res) => {
  try {
    const settings = await SiteSettings.findOne({});
    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error fetching site settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch site settings",
    });
  }
};
