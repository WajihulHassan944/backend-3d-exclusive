import mongoose from "mongoose";

// Schema for localized prices per currency
const localizedPricingSchema = new mongoose.Schema({
  currency: { type: String, required: true }, // e.g., "USD", "AFN", "ALL"
  price: { type: Number, required: true },    // price in that currency
}, { _id: false });

// 🆕 Schema for scheduled price changes
const scheduledPriceChangeSchema = new mongoose.Schema({
  newPrice: { type: Number, required: true },        // e.g., 65
  discountPercent: { type: Number, default: 0 },     // e.g., 10 for 10%
  startDate: { type: Date, required: true },         // when to apply new price
  endDate: { type: Date },                           // optional end date
  reason: { type: String, trim: true },              // e.g., "Black Friday Sale"
  isActive: { type: Boolean, default: true },        // allows disabling the schedule
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  packageType: {
    type: String,
    enum: ["Basic", "Standard", "Premium"],
    required: true,
  },
  credits: {
    type: Number,
    required: true,
  },
  priceEUR: {
    type: Number,
  },
  originalPriceEUR: {
    type: Number,
  },
   previousPriceEUR: { type: Number },
  description: {
    type: String,
    trim: true,
  },
  features: [
    {
      type: String,
      trim: true,
    },
  ],
  localizedPricing: {
    type: [localizedPricingSchema],
    default: [],
  },
  isPopular: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  package: {
    type: Number,
    default: 0,
  },

  // 🆕 Add scheduled price changes array
  scheduledPriceChanges: {
    type: [scheduledPriceChangeSchema],
    default: [],
  },
}, { timestamps: true });

export default mongoose.models.Product || mongoose.model("Product", productSchema);
