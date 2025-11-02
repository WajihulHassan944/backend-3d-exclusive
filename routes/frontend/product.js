import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductStats,
  getProductsByCurrency,
  schedulePriceChange,
  applyScheduledPriceChanges,
  getAllScheduledPriceChanges,
  deleteScheduledPriceChange,
  getAllInvoices,
  deleteUserInvoices,
} from "../../controllers/frontend/product.js";

const router = express.Router();
router.get("/stats", async (req, res) => {
  try {
    await applyScheduledPriceChanges(); // run silently
    const statsResult = await getProductStats(); // get real response
    res.json(statsResult); // send only the stats
  } catch (err) {
    console.error("Error running /stats sequence:", err);
    res.status(500).json({ success: false, message: "Error running product stats." });
  }
});

router.get("/by-currency", async (req, res) => {
  try {
    // 🟢 Apply any scheduled or expired price changes first
    await applyScheduledPriceChanges();

    // 🟢 Then fetch products by currency as usual
    await getProductsByCurrency(req, res);
  } catch (err) {
    console.error("Error running /by-currency sequence:", err);
    res.status(500).json({ success: false, message: "Error fetching products by currency." });
  }
});

router.get("/apply-scheduled-price-changes", applyScheduledPriceChanges);
router.get("/price-schedules", getAllScheduledPriceChanges);
router.get("/invoices", getAllInvoices);
router.post("/", createProduct);
router.get("/", async (req, res) => {
  try {
    // 🟢 Apply any active or expired scheduled price changes first
    await applyScheduledPriceChanges();

    // 🟢 Then run the original controller logic
    await getAllProducts(req, res);
  } catch (err) {
    console.error("Error running /products sequence:", err);
    res.status(500).json({ success: false, message: "Error fetching products." });
  }
});

router.get("/:id", getProductById);
router.put("/:id", updateProduct);
router.delete("/:id", deleteProduct);

router.post("/schedule-price-change/:id", schedulePriceChange);
router.delete("/product-to-schedule/:productId/schedule/:index", deleteScheduledPriceChange);
router.get("/delete-user-invoices/:userId", deleteUserInvoices);
export default router;
