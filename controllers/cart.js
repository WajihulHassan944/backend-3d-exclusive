import { Cart } from "../models/cart.js";

// ➕ Add a credit package
export const addCreditsToCart = async (req, res) => {
  try {
    const userId = req.user._id;
   const { amount, credits } = req.body;

if (!userId || !amount || !credits) {
  return res.status(400).json({ success: false, error: "Missing amount or credits" });
}

    let cart = await Cart.findOne({ user: userId });

const newCredit = { amount, credits };


    if (cart) {
      cart.credits.push(newCredit);
      await cart.save();
    } else {
      cart = await Cart.create({ user: userId, credits: [newCredit] });
    }

    return res.status(200).json({ success: true, cart });
  } catch (error) {
    console.error("❌ Error adding credit:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 📦 Get all credit packages for the authenticated user
export const getCartByUser = async (req, res) => {
  try {
    const userId = req.user._id;

    let cart = await Cart.findOne({ user: userId }).populate("user", "firstName email");

    // If no cart yet, return empty cart structure instead of error
    if (!cart) {
      return res.status(200).json({
        success: true,
        cart: {
          user: userId,
          credits: [],
          createdAt: null,
        },
      });
    }

    return res.status(200).json({ success: true, cart });
  } catch (error) {
    console.error("❌ Error fetching cart:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// ❌ Delete entire cart
export const deleteCartByUser = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await Cart.deleteOne({ user: userId });

    return res.status(200).json({
      success: true,
      message:
        result.deletedCount > 0 ? "Cart deleted successfully" : "No cart existed to delete",
    });
  } catch (error) {
    console.error("❌ Error deleting cart:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

// 🗑 Remove one credit package by index
export const removeCreditPackage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { index } = req.body;

    const cart = await Cart.findOne({ user: userId });
    if (!cart || !cart.credits.length) {
      return res.status(200).json({ success: true, cart: { user: userId, credits: [] } });
    }

    if (index < 0 || index >= cart.credits.length) {
      return res.status(400).json({ success: false, error: "Invalid credit index" });
    }

    cart.credits.splice(index, 1);
    await cart.save();

    return res.status(200).json({ success: true, cart });
  } catch (error) {
    console.error("❌ Error removing credit:", error);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};
