import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Connects to your existing User schema
      required: true,
    },

    roleOrProfession: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
userName: {
  type: String,
  required: true,
  trim: true,
},
productName: {
  type: String,
},

reviewTitle: {
  type: String,
},

featured: {
  type: Boolean,
  default: false,
},

email: {
  type: String,
  required: true,
  trim: true,
  lowercase: true,
},

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    reviewText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    photoUrl: {
      type: String, // URL to uploaded image (e.g. S3, Backblaze, etc.)
      required: false,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending", // For admin moderation if needed
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  }
);

export const Review = mongoose.model("Review", reviewSchema);
