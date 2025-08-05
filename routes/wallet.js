import express from 'express';
import { addBillingMethod, addFundsToWallet,  createSetupIntent,  createSetupIntentAllMethods,  getVat,  getWalletByUserId,  removeCard, setPrimaryCard, validateVATfunc } from '../controllers/wallet.js';
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
router.post('/create-setup-intent-all-cards', isAuthenticated, createSetupIntentAllMethods);
export default router;
