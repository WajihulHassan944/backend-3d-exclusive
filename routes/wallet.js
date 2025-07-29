import express from 'express';
import { addBillingMethod, addFundsToWallet,  getWalletByUserId,  removeCard, setPrimaryCard, validateVATfunc } from '../controllers/wallet.js';


const router = express.Router();

router.post('/add-billing-method', addBillingMethod);
router.post('/add-funds', addFundsToWallet);
router.put("/set-primary-card", setPrimaryCard);
router.delete("/remove-card", removeCard);
router.get('/all', getWalletByUserId);
router.post('/validate', validateVATfunc);

export default router;
