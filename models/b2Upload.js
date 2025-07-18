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
   quality: {
    type: String,
    enum: ["1080p", "2.7K", "4K"],
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
