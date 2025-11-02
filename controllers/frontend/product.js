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
    } = req.body;

   
    const newProduct = new Product({
      name,
      packageType,
      credits,
      priceEUR,
      originalPriceEUR,
      description,
      features,
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
};export const getProductsByCurrency = async (req, res) => {
  try {
    const { currency } = req.query;

    // Fetch all products
    const products = await Product.find().sort({ createdAt: -1 });

    // If no currency is provided, return products as is
    if (!currency) {
      return res.status(200).json({ success: true, products });
    }

    // Fetch latest exchange rates (base: EUR)
    const apiUrl =
      "https://v6.exchangerate-api.com/v6/85b74576b01e8837973975c5/latest/EUR";

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!data || data.result !== "success") {
      throw new Error("Failed to fetch exchange rates");
    }

    const rates = data.conversion_rates;
    const rate = rates[currency.toUpperCase()];

    if (!rate) {
      return res.status(400).json({
        success: false,
        message: `Unsupported currency: ${currency}`,
      });
    }

    // Convert using originalPriceEUR
    const convertedProducts = products.map((product) => {
      const p = product.toObject();

      const originalPriceEur = p.originalPriceEUR || 0;

      const localizedPricing = [
        {
          currency: currency.toUpperCase(),
          price: +(originalPriceEur * rate).toFixed(2),
        },
      ];

      return {
        ...p,
        localizedPricing,
      };
    });

    res.status(200).json({
      success: true,
      products: convertedProducts,
    });
  } catch (error) {
    console.error("Currency conversion error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during currency conversion",
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

    // 💰 Fetch all invoices
    const invoices = await Invoice.find({});

    // 🌍 Fetch exchange rates (base = EUR)
    const response = await fetch(
      "https://v6.exchangerate-api.com/v6/85b74576b01e8837973975c5/latest/EUR"
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rates: ${response.status}`);
    }
    const data = await response.json();
    const rates = data?.conversion_rates || {};

    // 💶 Convert total revenues to EUR
    let totalRevenue = 0;
    for (const inv of invoices) {
      const total = inv.total || 0;
      const currency = (inv.actualCurrency || "EUR").toUpperCase();

      if (currency === "EUR") {
        totalRevenue += total;
      } else if (rates[currency]) {
        const rateToEUR = 1 / rates[currency]; // convert to EUR
        totalRevenue += total * rateToEUR;
      } else {
        console.warn(`⚠️ Unknown currency "${currency}", skipping invoice`);
      }
    }

    // 🕒 Count active schedules
    const productsWithSchedules = await Product.find({
      "scheduledPriceChanges.isActive": true,
    });
    let activeSchedules = 0;
    for (const product of productsWithSchedules) {
      const activeCount = product.scheduledPriceChanges.filter(
        (s) => s.isActive
      ).length;
      activeSchedules += activeCount;
    }

    // 📊 Return stats in your original format
    return {
      success: true,
      totalProducts,
      activeProducts,
      activeSchedules,
      totalRevenue: totalRevenue.toFixed(2),
    };
  } catch (err) {
    console.error("Error fetching product stats:", err);
    res.status(500).json({ error: "Server error" });
  }
};


// Schedule a new price change for a product
export const schedulePriceChange = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPrice, discountPercent = 0, startDate, endDate, reason } = req.body;

    // Validate required fields
    if (!newPrice || !startDate) {
      return res.status(400).json({
        success: false,
        message: "newPrice and startDate are required.",
      });
    }

    // Find the product
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // Create a new schedule entry
    const newSchedule = {
      newPrice,
      discountPercent,
      startDate,
      endDate: endDate || null,
      reason: reason?.trim() || "",
      isActive: true,
    };

if (discountPercent > 0) {
  product.previousPriceEUR = product.originalPriceEUR || product.priceEUR;
}


    // Push into the product's schedule array
    product.scheduledPriceChanges.push(newSchedule);

    await product.save();

    res.status(200).json({
      success: true,
      message: "Price change scheduled successfully.",
      product,
    });
  } catch (error) {
    console.error("Schedule price change error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


export const applyScheduledPriceChanges = async (req, res) => {
  try {
    const now = new Date();
    const products = await Product.find({ "scheduledPriceChanges.0": { $exists: true } });

    let updatedProducts = [];

    for (const product of products) {
      let hasChanges = false;

      for (const schedule of product.scheduledPriceChanges) {
        if (!schedule.isActive) continue;

        const start = new Date(schedule.startDate);
        const end = schedule.endDate ? new Date(schedule.endDate) : null;

        // 🟢 If schedule is active now (between start and end date)
        if (start <= now && (!end || end >= now)) {
          let finalPrice = schedule.newPrice;

          // Apply discount if present
          if (schedule.discountPercent > 0) {
            const discountAmount = (schedule.newPrice * schedule.discountPercent) / 100;
            finalPrice = schedule.newPrice - discountAmount;
          }

          // 🆕 Save the previous price in main schema only once
          if (!product.previousPriceEUR) {
            product.previousPriceEUR = product.originalPriceEUR || product.priceEUR;
          }

          // Apply the new price if different
          if (product.originalPriceEUR !== finalPrice) {
            product.originalPriceEUR = parseFloat(finalPrice.toFixed(2));
            hasChanges = true;
          }
        }

        // 🔴 If schedule expired — revert to previous price
        if (end && now > end && schedule.isActive) {
          if (product.previousPriceEUR && product.originalPriceEUR !== product.previousPriceEUR) {
            product.originalPriceEUR = product.previousPriceEUR;
          }

      
          schedule.isActive = false; // deactivate the schedule
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await product.save();
        updatedProducts.push(product);
      }
    }

   return {
      success: true,
      message: "Scheduled price changes processed (including auto-revert).",
      updatedCount: updatedProducts.length,
      updatedProducts,
    };
  } catch (error) {
    console.error("Error applying scheduled price changes:", error);
    res.status(500).json({
      success: false,
      message: "Server error while applying scheduled price changes.",
      error: error.message,
    });
  }
};


// 📅 Get all scheduled price changes (for admin dashboard, etc.)
export const getAllScheduledPriceChanges = async (req, res) => {
  try {
    const now = new Date();

    // Fetch only products that have at least one schedule
    const products = await Product.find({ "scheduledPriceChanges.0": { $exists: true } });

    // Build formatted response
    const scheduleList = [];

    for (const product of products) {
      for (const schedule of product.scheduledPriceChanges) {
        const start = new Date(schedule.startDate);
        const end = schedule.endDate ? new Date(schedule.endDate) : null;

        // Determine schedule status
        let status = "Scheduled";
        if (schedule.isActive && start <= now && (!end || end >= now)) {
          status = "Active";
        } else if (end && now > end) {
          status = "Expired";
        }

        scheduleList.push({
          productId: product._id,
          productName: product.name,
          packageType: product.packageType,
          newPrice: `€${schedule.newPrice}`,
          discount: schedule.discountPercent > 0 ? `${schedule.discountPercent}% off` : "-",
          period: end
            ? `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`
            : `${start.toLocaleDateString()} onward`,
          reason: schedule.reason || "-",
          status,
        });
      }
    }

    res.status(200).json({
      success: true,
      total: scheduleList.length,
      schedules: scheduleList,
    });
  } catch (error) {
    console.error("Error fetching scheduled price changes:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching scheduled price changes.",
      error: error.message,
    });
  }
};



// 🗑️ Delete a specific scheduled price change
export const deleteScheduledPriceChange = async (req, res) => {
  try {
    const { productId, index } = req.params;

    // Find product by ID
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    // Validate schedule index
    if (
      !product.scheduledPriceChanges ||
      index < 0 ||
      index >= product.scheduledPriceChanges.length
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule index.",
      });
    }

    // 🧹 Remove the schedule from array
    const removed = product.scheduledPriceChanges.splice(index, 1)[0];

// 🆕 Revert price if previousPriceEUR exists
if (product.previousPriceEUR) {
  product.originalPriceEUR = product.previousPriceEUR;
  product.previousPriceEUR = null; // clear it after revert
}

await product.save();


    res.status(200).json({
      success: true,
      message: "Scheduled price change deleted successfully.",
      removedSchedule: removed,
      product,
    });
  } catch (error) {
    console.error("Error deleting scheduled price change:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting scheduled price change.",
      error: error.message,
    });
  }
};
export const getAllInvoices = async (req, res) => {
  try {
    // 🧾 Fetch all invoices (you can also sort by date)
    const invoices = await Invoice.find({}).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: invoices.length,
      invoices,
    });
  } catch (err) {
    console.error("Error fetching invoices:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching invoices",
      error: err.message,
    });
  }
};

export const deleteUserInvoices = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return next(new ErrorHandler("User ID is required", 400));
    }

    const result = await Invoice.deleteMany({ user: userId });

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} invoices for user ${userId}`,
    });
  } catch (error) {
    console.error("❌ Error deleting invoices:", error);
    return next(new ErrorHandler("Failed to delete invoices", 500));
  }
};