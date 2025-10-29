import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductStats,
  getProductsByCurrency,
} from "../../controllers/frontend/product.js";

const router = express.Router();

router.get("/stats", getProductStats);
router.get("/by-currency", getProductsByCurrency);
router.post("/", createProduct);
router.get("/", getAllProducts);
router.get("/:id", getProductById);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

export default router;
