import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["image", "video", "external"], // 'external' for YouTube/Vimeo links
      required: true,
    },
    size: {
      type: String, // e.g., "2.3 MB"
      default: null,
    },
    dimensions: {
      type: String, // e.g., "1920x1080"
      default: null,
    },
    uploadDate: {
      type: Date,
      default: Date.now,
    },
    name: {
      type: String,
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    // For external videos (YouTube/Vimeo)
    platform: {
      type: String,
      enum: ["youtube", "vimeo", null],
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Media || mongoose.model("Media", mediaSchema);
