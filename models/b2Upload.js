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
  
  fps: {
    type: String, 
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
   freeTrial: {
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
  threeDExperience: {
  type: String,
  enum: ["Cinema", "Comfort", "Aggressive"],
  default: "Comfort",
},
estimatedProcessingTime: { type: Number }, // in seconds or minutes

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
startedAt: {
  type: Date,
  default: null, // set when processing begins
},

completedAt: {
  type: Date,
  default: null,
},
clientInfo: {
  type: mongoose.Schema.Types.Mixed,
  default: null,
},
startTime: {
  type: Number, // trim start (seconds)
},

endTime: {
  type: Number, // trim end (seconds)
},

trimOnly: {
  type: Boolean,
  default: false,
},
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Video = mongoose.model("Video", videoSchema);
