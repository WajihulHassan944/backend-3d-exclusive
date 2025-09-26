import express from 'express';
import { addBillingMethod, addCredits, addFundsToWallet,  cancelOrder,  createManualOrder,  createPaymentIntentAllMethods,  createSetupIntent,  deleteCustomer,  deleteCustomersCredits,  deleteOrder,  getAllCustomersCredits,  getAllOrders,  getCreditsStats,  getInvoiceById,  getOrderStats,  getVat,  getWalletByUserId,  refundVideoCredits,  removeCard, removeCredits, setPrimaryCard, updateManualOrder, validateVATfunc } from '../controllers/wallet.js';
import { isAuthenticated } from "../middlewares/auth.js";


const router = express.Router();

router.post('/add-billing-method', addBillingMethod);
router.post('/add-funds', addFundsToWallet);
router.put("/set-primary-card", setPrimaryCard);
router.delete("/remove-card", removeCard);
router.get('/all', getWalletByUserId);
router.post('/validate', validateVATfunc);
router.post('/checkVat', getVat);
router.post('/create-setup-intent', isAuthenticated, createSetupIntent);
router.post('/create-payment-intent-all-methods', isAuthenticated, createPaymentIntentAllMethods);
router.get("/all-customers-credits", getAllCustomersCredits);
router.post("/customers/add-credits", addCredits);
router.post("/customers/remove-credits", removeCredits);
router.get("/credits-stats", getCreditsStats);
router.get("/orders-stats", getOrderStats);
router.get("/orders/all", getAllOrders);
router.post('/orders/manual-order', createManualOrder);
router.delete("/order/:id", deleteOrder);
router.get("/delete-customers-credits", deleteCustomersCredits);
router.post("/videos/refund-credits", refundVideoCredits);
router.delete("/customer/delete", deleteCustomer);
router.put("/orders/manual-order/:id", updateManualOrder);
router.get("/getInvoiceById/:id", getInvoiceById);
router.post("/cancelOrder/:id", cancelOrder);
export default router;
