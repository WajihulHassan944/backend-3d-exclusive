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
    lastLogin: {
    type: Date,
    default: null,
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
    enum: ["user", "admin", "moderator"],
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
  
  address: {
    street: { type: String },
    city: { type: String },
    postalCode: { type: String },
    country: { type: String },
  },

  companyName: { type: String },
  vatNumber: { type: String },

  status: {
    type: String,
    enum: ["active", "inactive", "suspended"],
    default: "active",
  },

  
});
export const User = mongoose.model("User", schema);
