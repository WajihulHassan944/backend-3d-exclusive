import { Review } from "../../models/frontend/reviews.js";
import { User } from "../../models/user.js";
import streamifier from "streamifier";
import cloudinary from "../../utils/cloudinary.js";
import { Invoice } from "../../models/invoice.js";
import product from "../../models/frontend/product.js";

export const postReview = async (req, res) => {
  try {
    const { name, roleOrProfession, rating, reviewText, featured, reviewTitle } = req.body;
    const userId = req.user?._id;

    if (!userId || !roleOrProfession || !rating || !reviewText) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields.",
      });
    }

    // ✅ Find user to extract name + email
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const userName = name?.trim() || `${user.firstName || ""} ${user.lastName || ""}`.trim();
    const email = user.email;

    // 🆕 Get product name from last invoice credits
    let productName = "Package"; // fallback
    const lastInvoice = await Invoice.findOne({ user: userId }).sort({ issuedAt: -1 }).lean();
    if (lastInvoice?.credits?.length) {
      const credit = lastInvoice.credits[0];
      const productData = await product.findOne({ credits: credit.credits }).lean();
      if (productData?.name) productName = productData.name;
    }

    let photoUrl = "";

    // ✅ If photo uploaded, send to Cloudinary
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "user_reviews",
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [{ quality: "auto" }],
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      photoUrl = uploadResult.secure_url;
    }

    // ✅ Save review in DB
    const newReview = new Review({
      userId,
      userName,
      email,
      roleOrProfession,
      reviewTitle,
      rating,
      reviewText,
      photoUrl,
      productName,
      featured: featured === true || featured === "true", // ensure boolean
    });

    await newReview.save();
await Invoice.updateMany(
  { user: userId },
  { $set: { reviewGiven: true } }
);
    return res.status(201).json({
      success: true,
      message: "Review posted successfully.",
      review: newReview,
    });
  } catch (error) {
    console.error("Error posting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to post review.",
      error: error.message,
    });
  }
};




// 📍 Get all reviews
export const getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 }); // latest first
    return res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews.",
      error: error.message,
    });
  }
};

// 📍 Get single review by ID
export const getReviewById = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    return res.status(200).json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Error fetching review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch review.",
      error: error.message,
    });
  }
};

export const updateReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    let photoUrl = review.photoUrl; // keep old photo by default

    // ✅ If a new file is uploaded
    if (req.file) {
      // delete previous image from Cloudinary if exists
      if (photoUrl) {
        try {
          const publicId = photoUrl.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`user_reviews/${publicId}`);
        } catch (err) {
          console.warn("Previous image delete failed:", err.message);
        }
      }

      // upload new image
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "user_reviews",
            resource_type: "image",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],
            transformation: [{ quality: "auto" }],
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      photoUrl = uploadResult.secure_url;
    }

    // ✅ Update fields
    const updateData = {
      ...req.body,
      photoUrl,
    };

    const updatedReview = await Review.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: "Review updated successfully.",
      review: updatedReview,
    });
  } catch (error) {
    console.error("Error updating review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update review.",
      error: error.message,
    });
  }
};


// 📍 Delete review by ID
export const deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReview = await Review.findByIdAndDelete(id);

    if (!deletedReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete review.",
      error: error.message,
    });
  }
};


export const getReviewStats = async (req, res) => {
  try {
    // Aggregate stats
    const stats = await Review.aggregate([
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] }
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] }
          }
        }
      }
    ]);

    const data = stats[0] || {
      totalReviews: 0,
      avgRating: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    return res.status(200).json({
      success: true,
      stats: {
        totalReviews: data.totalReviews,
        avgRating: Number(data.avgRating.toFixed(2)),
        pending: data.pending,
        approved: data.approved,
        rejected: data.rejected
      }
    });
  } catch (error) {
    console.error("Error getting review stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get review stats.",
      error: error.message
    });
  }
};


export const approveOrRejectReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
console.log(req.body);
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected".'
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found."
      });
    }

    review.status = status;
    await review.save();

    return res.status(200).json({
      success: true,
      message: `Review ${status} successfully.`,
      review
    });
  } catch (error) {
    console.error("Error updating review status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update review status.",
      error: error.message
    });
  }
};