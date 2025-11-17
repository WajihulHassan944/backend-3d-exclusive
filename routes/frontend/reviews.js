import express from "express";
import {
  postReview,
  getAllReviews,
  getReviewById,
  updateReview,
  deleteReview,
  getReviewStats,
  approveOrRejectReview,
} from "../../controllers/frontend/reviews.js";

import upload from "../../middlewares/upload.js"; // same multer memory storage setup
import { isAuthenticated } from "../../middlewares/auth.js";

const router = express.Router();
router.post("/add",isAuthenticated, upload.single("photo"), postReview);
router.get("/stats", getReviewStats);
router.get("/all", getAllReviews);
router.get("/:id", getReviewById);
router.put("/update/:id", upload.single("photo"), updateReview);
router.delete("/delete/:id", deleteReview);
router.put("/status/:id", isAuthenticated, approveOrRejectReview);

export default router;
