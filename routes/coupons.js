// routes/coupons.js
import express from "express";
import {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  getCouponStats,
} from "../controllers/coupon.js";


const router = express.Router();

router.post("/create", createCoupon);
router.get("/all", getAllCoupons);
router.get("/get-coupon-by-id/:id", getCouponById);
router.put("/update/:id", updateCoupon);
router.delete("/delete/:id", deleteCoupon);
router.get("/stats", getCouponStats);

export default router;
