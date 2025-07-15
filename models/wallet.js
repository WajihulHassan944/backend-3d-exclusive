import mongoose from "mongoose";

const cardSchema = new mongoose.Schema({
  stripeCardId: { type: String, required: true }, // Stripe token or card ID
  brand: String, // e.g., Visa, MasterCard
  last4: String, // e.g., 4242
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
      description: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
});

export const Wallet = mongoose.model("Wallet", walletSchema);
