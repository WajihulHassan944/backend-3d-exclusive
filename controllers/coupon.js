import Coupon from "../models/coupon.js";
export const createCoupon = async (req, res) => {
  try {
const {
  code,
  type,
  amount,
  description,
  usageLimit,
  expiryDate,
  status,
  minCartTotal,
  maxCartTotal,
  allowCombine,
  excludeSaleItems,
  productRestriction,
  freeShipping,
  cartMinItems,
  usageRestriction,  
} = req.body;


    // 1. Validate required fields
    if (!code || !type || !expiryDate) {
      return res.status(400).json({
        success: false,
        message: "Code, type, and expiry date are required",
      });
    }
if (type === "fixed_cart" && (!cartMinItems || cartMinItems < 1)) {
  return res.status(400).json({
    success: false,
    message: "Cart minimum items is required and must be at least 1 for fixed cart coupons",
  });
}

if (type === "fixed_product" && (!productRestriction || productRestriction.length === 0)) {
  return res.status(400).json({
    success: false,
    message: "Product restriction is required for fixed product coupons",
  });
}
    // 2. Check if coupon code already exists (case-insensitive)
    const existing = await Coupon.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    // 3. Validate amount based on type
    let finalAmount = amount || 0;
    let finalFreeShipping = freeShipping || false;

    if (type === "percentage") {
      if (finalAmount <= 0 || finalAmount > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount must be between 1 and 100",
        });
      }
    }

    if (type === "shipping") {
      finalAmount = 0;
      finalFreeShipping = true;
    }

    // 4. Normalize expiry date -> set to end of day (23:59:59.999)
    const expiry = new Date(expiryDate);
    expiry.setHours(23, 59, 59, 999);

    // 5. Create coupon object
   const coupon = new Coupon({
  code: code.toUpperCase(),
  type,
  amount: finalAmount,
  description,
  usageLimit: usageLimit || null,
  expiryDate: expiry,
  status: status || "active",
  minCartTotal: minCartTotal || 0,
  maxCartTotal: maxCartTotal || null,
  allowCombine: allowCombine !== undefined ? allowCombine : true,
  excludeSaleItems: excludeSaleItems || false,
  productRestriction: productRestriction || [],
  freeShipping: finalFreeShipping,
  cartMinItems: cartMinItems || null,

  // ✅ New nested object
  usageRestriction: {
    restrictionCode: usageRestriction?.restrictionCode || "",
    restrictionAmount: usageRestriction?.restrictionAmount || 0,
    individualUseOnly: usageRestriction?.individualUseOnly || false,
    userEmail: usageRestriction?.userEmail || "",
  },
});


    // 6. Save in DB
    await coupon.save();

    // 7. Return success response
    return res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      data: coupon,
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating coupon",
      error: error.message,
    });
  }
};



export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: coupons.length,
      data: coupons,
    });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching coupons",
      error: error.message,
    });
  }
};

export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: coupon,
    });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching coupon",
      error: error.message,
    });
  }
};
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    let updates = { ...req.body };

    // Normalize code if provided
    if (updates.code) {
      updates.code = updates.code.toUpperCase();
    }

    // Normalize expiryDate if provided
    if (updates.expiryDate) {
      const expiry = new Date(updates.expiryDate);
      expiry.setHours(23, 59, 59, 999);
      updates.expiryDate = expiry;
    }

    // Handle type-specific validation
    if (updates.type === "percentage") {
      if (updates.amount <= 0 || updates.amount > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount must be between 1 and 100",
        });
      }
    }

    if (updates.type === "shipping") {
      updates.amount = 0;
      updates.freeShipping = true;
    }

    const coupon = await Coupon.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      data: coupon,
    });
  } catch (error) {
    console.error("Error updating coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating coupon",
      error: error.message,
    });
  }
};

export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting coupon",
      error: error.message,
    });
  }
};



export const getCouponStats = async (req, res) => {
  try {
    const coupons = await Coupon.find();

    const totalCoupons = coupons.length;
    const activeCoupons = coupons.filter((c) => c.status === "active").length;

    // Total Savings = sum of (usageCount * amount)
    const totalSavings = coupons.reduce((sum, c) => {
      if (c.type === "percentage") {
        // Example assumption: €100 average order -> savings = amount% of 100
        const avgOrder = 100;
        return sum + (c.usageCount * (avgOrder * (c.amount / 100)));
      } else if (c.type === "fixed_cart" || c.type === "fixed_product") {
        return sum + (c.usageCount * c.amount);
      } else if (c.type === "shipping") {
        // Example assumption: avg €10 shipping saved
        return sum + (c.usageCount * 10);
      }
      return sum;
    }, 0);

    // Usage Rate = total usage / total usage limit
    const totalUsage = coupons.reduce((sum, c) => sum + c.usageCount, 0);
    const totalLimit = coupons.reduce(
      (sum, c) => sum + (c.usageLimit || 0),
      0
    );
    const usageRate =
      totalLimit > 0 ? Math.round((totalUsage / totalLimit) * 100) : 0;

    // Format in Euro
    const euroFormatter = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
    });

    res.json({
      success: true,
      data: {
        totalCoupons,
        activeCoupons,
        totalSavings: euroFormatter.format(totalSavings), // e.g. "12.450 €"
        usageRate: `${usageRate}%`,
      },
    });
  } catch (err) {
    console.error("Error fetching coupon stats:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getValidCoupons = async (req, res) => {
  try {
    const now = new Date();

    const coupons = await Coupon.find({
      status: "active",
      "usageRestriction.individualUseOnly": false, // only allow shared coupons
      $expr: {
        $and: [
          // expiryDate must be >= now
          { $gte: ["$expiryDate", now] },
          {
            $or: [
              { $eq: ["$usageLimit", null] }, // unlimited
              { $lt: ["$usageCount", "$usageLimit"] }
            ]
          }
        ]
      }
    })
      .select("_id code description")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: coupons.length,
      data: coupons,
    });
  } catch (error) {
    console.error("Error fetching valid coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching valid coupons",
      error: error.message,
    });
  }
};

export const validateCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim() });

    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    // Status check
    if (coupon.status !== "active") {
      return res.status(400).json({ success: false, message: "Coupon is inactive" });
    }

    // Expiry check
    if (coupon.expiryDate && new Date() > coupon.expiryDate) {
      return res.status(400).json({ success: false, message: "Coupon has expired" });
    }

    // Usage limit check
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached" });
    }
     if (coupon.usageRestriction?.individualUseOnly) {
      if (!req.user || !req.user.email) {
        return res.status(401).json({ success: false, message: "Authentication required to use this coupon" });
      }
      if (req.user.email.toLowerCase() !== coupon.usageRestriction.userEmail.toLowerCase()) {
        return res.status(403).json({ success: false, message: "This coupon is restricted to another user" });
      }
    }

    // ✅ Valid coupon, return all coupon data
    return res.status(200).json({
      success: true,
      message: "Coupon is valid",
      coupon,
    });

  } catch (error) {
    console.error("Coupon validation error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
export const expireCoupons = async (req, res) => {
  try {
    const now = new Date();

    const result = await Coupon.updateMany(
      { expiryDate: { $lt: now }, status: "active" },
      { $set: { status: "inactive" } }
    );

    return res.status(200).json({
      success: true,
      message: `Expired coupons marked inactive successfully`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error expiring coupons:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while expiring coupons",
      error: error.message,
    });
  }
};