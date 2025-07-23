import mongoose from "mongoose";

const creditItemSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  credits: {
  type: String,
},

  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // one cart per user
  },
  credits: [creditItemSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Cart = mongoose.model("Cart", cartSchema);
