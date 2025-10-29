// models/Product.js
import mongoose from "mongoose";

// Schema for localized prices per currency
const localizedPricingSchema = new mongoose.Schema({
  currency: { type: String, required: true }, // e.g., "USD", "AFN", "ALL"
  price: { type: Number, required: true },    // price in that currency
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
    required: true,
  },
  originalPriceEUR: {
    type: Number,
  },
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
}, { timestamps: true });

export default mongoose.models.Product || mongoose.model("Product", productSchema);
