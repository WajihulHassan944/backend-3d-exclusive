import express from 'express';
import { addBillingMethod, addFundsToWallet,  removeCard, setPrimaryCard, withdrawFunds } from '../controllers/wallet.js';


const router = express.Router();

router.post('/add-billing-method', addBillingMethod);
router.post('/add-funds', addFundsToWallet);
router.put("/set-primary-card", setPrimaryCard);
router.delete("/remove-card", removeCard);
router.post("/withdraw", withdrawFunds);


export default router;
