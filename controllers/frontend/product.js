import Product from "../../models/frontend/product.js";
import { Invoice } from "../../models/invoice.js";

/**
 * Helper to generate localized pricing for given credits
 */
const generateLocalizedPricing = (pricingMap, credits) => {
  const localizedArray = [];

  // pricingMap is an object like:
  // { AFN: {15: 2000, 50: 5000, 120: 10000}, ALL: {...}, ... }
  for (const [currencyCode, creditMap] of Object.entries(pricingMap)) {
    if (creditMap[credits]) {
      localizedArray.push({
        currency: currencyCode,
        price: creditMap[credits],
      });
    }
  }

  return localizedArray;
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      packageType,
      credits,
      priceEUR,
      originalPriceEUR,
      description,
      features,
      isPopular,
      isActive,
      localizedPricingMap, // <-- big object you send
    } = req.body;

    // Generate localized pricing array for the current product tier
    const localizedPricing = localizedPricingMap
      ? generateLocalizedPricing(localizedPricingMap, credits)
      : [];

    const newProduct = new Product({
      name,
      packageType,
      credits,
      priceEUR,
      originalPriceEUR,
      description,
      features,
      localizedPricing,
      isPopular,
      isActive,
    });

    await newProduct.save();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

export const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, products });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
export const getProductsByCurrency = async (req, res) => {
  try {
    const { currency } = req.query;

    const products = await Product.find().sort({ createdAt: -1 });

    const filteredProducts = currency
      ? products.map((product) => ({
          ...product.toObject(),
          localizedPricing: product.localizedPricing.filter(
            (p) => p.currency.toLowerCase() === currency.toLowerCase()
          ),
        }))
      : products;

    res.status(200).json({ success: true, products: filteredProducts });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};
export const updateProduct = async (req, res) => {
  try {
    const updateData = req.body; // Directly accept whatever JSON frontend sends

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedProduct) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


export const deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ success: false, message: "Product not found" });

    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};



export const getProductStats = async (req, res) => {
  try {
    // 🧾 Fetch all products
    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ isActive: true });

    const invoices = await Invoice.find({});
    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

    // 📊 Return lifetime stats
    res.json({
      totalProducts,
      activeProducts,
      totalRevenue: totalRevenue.toFixed(2)
    });
  } catch (err) {
    console.error("Error fetching product stats:", err);
    res.status(500).json({ error: "Server error" });
  }
};


