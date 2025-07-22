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
    lengthInSeconds: {
    type: Number,
  },
  conversionFormat: {
  type: String,
  enum: ["MV-HEVC", "Full Side by Side"],
},

quality: {
  type: String,
  enum: ["480p", "720p", "1080p", "2.7K", "4K", "5K", "6K", "8K"],
},



  status: {
    type: String,
    enum: ["uploaded", "processing", "completed", "failed"],
    default: "uploaded",
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
