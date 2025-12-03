import mongoose from "mongoose";

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
identifier: {
      type: String,
},
    type: {
      type: String,
      enum: ["image", "video", "external"],
      required: true,
    },

    size: { type: String, default: null },     // "2.3 MB"
    dimensions: { type: String, default: null }, // "1920x1080"

    uploadDate: { type: Date, default: Date.now },

    name: { type: String, trim: true },        // file name
    alt: { type: String, trim: true },         // NEW FIELD

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    platform: {
      type: String,
      enum: ["youtube", "vimeo", null],
      default: null,
    },

   transformations: {
  cropWidth: { type: Number, default: null },
  cropHeight: { type: Number, default: null },
  aspectRatio: { type: String, default: "free" },

  resizeWidth: { type: Number, default: null },
  resizeHeight: { type: Number, default: null },
  keepAspect: { type: Boolean, default: true },

  rotate: { type: Number, default: 0 },

  filter: { type: String, default: "" },
  filterIntensity: { type: Number, default: 100 },

  quality: { type: String, default: "original" },
  format: { type: String, default: "original" },
},

  },
  { timestamps: true }
);

export default mongoose.models.Media || mongoose.model("Media", mediaSchema);
0