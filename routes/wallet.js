import express from 'express';
import { addBillingMethod, addCredits, addFundsToWallet,  createManualOrder,  createPaymentIntentAllMethods,  createSetupIntent,  getAllCustomersCredits,  getAllOrders,  getCreditsStats,  getOrderStats,  getVat,  getWalletByUserId,  removeCard, removeCredits, setPrimaryCard, validateVATfunc } from '../controllers/wallet.js';
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
export default router;
