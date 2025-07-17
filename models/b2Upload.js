import mongoose from "mongoose";

const videoSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  originalFileName: {
    type: String,
    required: true,
  },
  b2Url: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["uploaded to 3d cloud", "processing", "completed", "failed"],
    default: "uploaded to 3d cloud",
  },
  convertedUrl: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Video = mongoose.model("Video", videoSchema);
