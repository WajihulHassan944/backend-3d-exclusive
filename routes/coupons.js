// routes/coupons.js
import express from "express";
import {
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  getCouponStats,
  getValidCoupons,
  validateCoupon,
  expireCoupons,
} from "../controllers/coupon.js";
import { isAuthenticated } from "../middlewares/auth.js";


const router = express.Router();

router.post("/create", createCoupon);
router.get("/all", getAllCoupons);
router.get("/get-coupon-by-id/:id", getCouponById);
router.put("/update/:id", updateCoupon);
router.delete("/delete/:id", deleteCoupon);
router.get("/stats", getCouponStats);
router.get("/valid", getValidCoupons);
router.post("/validate-coupon",isAuthenticated, validateCoupon);
router.get("/expire", expireCoupons);

export default router;
