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
  totalPurchased: {
    type: Number,
    default: 0.0, // keep track of all purchased credits, even if invoices are deleted
  },
  cards: [cardSchema],
});

export const Wallet = mongoose.model("Wallet", walletSchema);
