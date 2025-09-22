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
  fileSize: {
    type: String, // e.g. "125 MB"
  },
  b2Url: {
    type: String,
    required: true,
  },
  convertedUrl: {
    type: String,
    default: "",
  },
    creditsRefunded: {
    type: Boolean,
    default: false,
  },

  lengthInSeconds: {
    type: Number,
  },
  conversionFormat: {
    type: String,
    enum: [
      "MV-HEVC",
      "Full Side by Side",
      "Video to Audio",
      "Audio Enhancement",
      "Image Upscaling",
      "Video Compression",
      "Audio Transcription",
    ],
  },
  quality: {
    type: String,
  },
  progress: {
    type: Number,
    default: 0, 
  },
  creditsUsed: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["uploaded", "processing", "completed", "failed", "pending", "expired", "queued"],
    default: "uploaded",
  },
  errorMessage: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Video = mongoose.model("Video", videoSchema);
