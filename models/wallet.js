import mongoose from "mongoose";

const cardSchema = new mongoose.Schema({
  stripeCardId: { type: String, required: true },
  brand: String,
  last4: String,
  expMonth: String,
  expYear: String,
  isPrimary: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    unique: true,
    required: true,
  },
  stripeCustomerId: { type: String, required: true },
  balance: {
    type: Number,
    default: 0.0,
  },
  cards: [cardSchema],
  transactions: [
    {
      type: { type: String, enum: ["credit", "debit"] },
      amount: Number,
      currency: String, // e.g., EUR
     credits: [
  {
    amount: Number,
    credits: Number,
    addedAt: Date,
  }
],

      description: String,
      createdAt: { type: Date, default: Date.now },
      billingInfo: {
        street: String,
        postalCode: String,
        city: String,
        country: String,
        companyName: String,
        vatNumber: String,
      },
      stripePayment: {
        id: String,
        amount: Number,
        currency: String,
        payment_method: String,
        receipt_url: String,
        created: Number,
        status: String,
      },
    },
  ],
});

export const Wallet = mongoose.model("Wallet", walletSchema);
