// models/Coupon.js
import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["percentage", "fixed_cart", "fixed_product", "shipping"],
      required: true,
    },

    amount: {
      type: Number,
      default: 0, // For free shipping, this can stay 0
    },

    description: {
      type: String,
      trim: true,
    },

    // Usage tracking
    usageCount: {
      type: Number,
      default: 0,
    },
    usageLimit: {
      type: Number,
      default: null, // null = unlimited
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Restrictions
    minCartTotal: {
      type: Number,
      default: 0,
    },
    maxCartTotal: {
      type: Number,
      default: null, // no max if null
    },
    allowCombine: {
      type: Boolean,
      default: true, // if false, cannot use with other coupons
    },
    excludeSaleItems: {
      type: Boolean,
      default: false,
    },

    // Product restriction (only allow certain product codes: 15, 50, 120)
    productRestriction: [
      {
        type: Number,
        enum: [15, 50, 120],
      },
    ],
cartMinItems: {
  type: Number,
  default: null, // null = no restriction
  min: 1,        // must be at least 1 if provided
},
usedBy: [
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    email: { type: String },
    usedAt: { type: Date, default: Date.now },
  },
],
usageRestriction: {
  restrictionCode: { type: String, trim: true },
  restrictionAmount: { type: Number, default: 0 },
  individualUseOnly: { type: Boolean, default: false }, 
  userEmail: { type: String, trim: true, lowercase: true },
},

    // Free shipping flag
    freeShipping: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual: Usage Rate
couponSchema.virtual("usageRate").get(function () {
  if (!this.usageLimit || this.usageLimit === 0) return 0;
  return Math.round((this.usageCount / this.usageLimit) * 100);
});

// Pre-save validation for coupon type & amount
couponSchema.pre("save", function (next) {
  if (this.type === "shipping") {
    this.amount = 0; // Shipping coupons shouldn't have amount
    this.freeShipping = true;
  }
  if (this.type === "percentage" && (this.amount < 0 || this.amount > 100)) {
    return next(new Error("Percentage amount must be between 0 and 100"));
  }
  next();
});

const Coupon =
  mongoose.models.Coupon || mongoose.model("Coupon", couponSchema);

export default Coupon;
