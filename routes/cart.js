import express from "express";
import {
  addCreditsToCart,
  getCartByUser,
  deleteCartByUser,
  removeCreditPackage,
} from "../controllers/cart.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

router.post("/add",isAuthenticated, addCreditsToCart);                // Add one credit package
router.get("/user",isAuthenticated, getCartByUser);               // Get all packages for a user
router.delete("/user",isAuthenticated, deleteCartByUser);         // Delete entire cart
router.post("/remove",isAuthenticated, removeCreditPackage);          // Remove one package by index

export default router;
