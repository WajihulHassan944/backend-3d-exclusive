import mongoose from "mongoose";

const schema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
  },
  lastName: {
    type: String,
    required: false,
  },
   profileUrl: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    required: false,
    type: String,
    select: false,
  },
  hasFreeConversion: {
  type: Boolean,
  default: true, // one-time gift on registration
},
appleId: { type: String, unique: true, sparse: true },
newsletterOptIn: {
  type: Boolean,
  default: false,
},

  country: {
    type: String,
  },
  stripeAccountId: {
  type: String,
  required: false,
},
  role: {
    type: [String],
    enum: ["user", "admin"],
    default: ["user"],
  },
  verified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  
});
export const User = mongoose.model("User", schema);
