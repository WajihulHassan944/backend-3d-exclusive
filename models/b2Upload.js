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
  convertedUrl: {
    type: String,
    required: false,
    default:"",
  },
    lengthInSeconds: {
    type: Number,
  },
  conversionFormat: {
  type: String,
  enum: ["MV-HEVC", "Full Side by Side"],
},
quality: {
  type: String,
  required: false,
},
  status: {
    type: String,
    enum: ["uploaded", "processing", "completed", "failed"],
    default: "uploaded",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Video = mongoose.model("Video", videoSchema);
