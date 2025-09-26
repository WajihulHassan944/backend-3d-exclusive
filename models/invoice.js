import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema({
  refundId: String, // Stripe refund ID
  amount: Number,
  reason: String,
  createdAt: { type: Date, default: Date.now }
});

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true }, // e.g. X3D-2025-0001
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  credits: [
    {
      amount: Number,
      credits: Number,
      addedAt: Date,
      reason: { type: String, default: "" },   
      expiryAt: { type: Date },                
      isManual: { type: Boolean, default: false } 
    }
  ],
  amount: { type: Number, required: true }, // subtotal (excluding VAT)
  vat: { type: Number, default: 0 },        // VAT amount
  vatRate: { type: Number, default: 0 },    // e.g. 0.21
  
  isReverseCharge: { type: Boolean, default: false },
  vatNote: { type: String, default: "" },   // legal note if reverse charged
method: { type: String, default: "" }, 

  total: { type: Number, required: true },  // amount + VAT
  currency: { type: String, default: 'EUR' },

  stripePaymentId: String,
priceBeforeDiscount: { type: Number, default: null }, // original subtotal before coupon
discountAmount: {type: Number, default: null},
couponCode: { type: String, default: null }, // applied coupon code
  billingInfo: {
    name: String,
    street: String,
    postalCode: String,
    city: String,
    country: String,        // ISO code (e.g. 'NL')
    countryName: String,    // Full name (e.g. 'Netherlands')
    companyName: String,
    address: String,
    vatNumber: String,
  },
 status: { 
    type: String, 
    enum: ["pending", "paid", "cancelled", "completed"], 
    default: "completed" 
  },

  notes: { type: String, default: "" },
  issuedAt: { type: Date, default: Date.now },

  refunds: [refundSchema],   
  cancelledAt: { type: Date }
});

export const Invoice = mongoose.model('Invoice', invoiceSchema);
