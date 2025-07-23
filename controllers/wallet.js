
import ErrorHandler from "../middlewares/error.js";
import { User } from "../models/user.js";
import { Wallet } from "../models/wallet.js";
import stripe from "../utils/stripe.js";
import mongoose from "mongoose";

// POST /api/wallet/add-billing-method
export const addBillingMethod = async (req, res, next) => {
  try {
    const { userId, paymentMethodId } = req.body;

    const user = await User.findById(userId);
    if (!user) return next(new ErrorHandler("User not found", 404));

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) return next(new ErrorHandler("Wallet not found", 404));

    // ✅ Duplicate check before Stripe operations
    const alreadyExists = wallet.cards.some(
      (c) => c.stripeCardId === paymentMethodId
    );
    if (alreadyExists) {
      return next(new ErrorHandler("Card already added", 409));
    }

    // ✅ Step 1: Create a Stripe Customer if not exists
    if (!wallet.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });

      wallet.stripeCustomerId = customer.id;
      await wallet.save();
    }

    // ✅ Step 2: Attach payment method to customer
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: wallet.stripeCustomerId,
    });

    // ✅ Step 3: Set default payment method
    await stripe.customers.update(wallet.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // ✅ Step 4: Save in MongoDB
    const isFirstCard = wallet.cards.length === 0;

    wallet.cards.push({
      stripeCardId: paymentMethod.id,
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      isPrimary: isFirstCard,
    });

    await wallet.save();

    return res.status(200).json({
      success: true,
      message: "Billing method added successfully.",
      card: {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
        isPrimary: isFirstCard,
      },
    });
  } catch (error) {
    console.error("❌ Error adding billing method:", error);
    next(error);
  }
};












export const setPrimaryCard = async (req, res, next) => {
  const { userId, stripeCardId } = req.body;

  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return next(new ErrorHandler("Wallet not found", 404));

  const card = wallet.cards.find(c => c.stripeCardId === stripeCardId);
  if (!card) return next(new ErrorHandler("Card not found", 404));

  wallet.cards.forEach(c => c.isPrimary = false);
  card.isPrimary = true;

  // Optional: update Stripe default payment method
  await stripe.customers.update(wallet.stripeCustomerId, {
    invoice_settings: { default_payment_method: stripeCardId }
  });

  await wallet.save();

  res.status(200).json({ success: true, message: "Primary card updated successfully." });
};

// DELETE /api/wallet/remove-card
export const removeCard = async (req, res, next) => {
  try {
    const { userId, stripeCardId } = req.body;

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return next(new ErrorHandler("Wallet not found", 404));

    const cardIndex = wallet.cards.findIndex(c => c.stripeCardId === stripeCardId);
    if (cardIndex === -1) return next(new ErrorHandler("Card not found", 404));

    const isPrimary = wallet.cards[cardIndex].isPrimary;

    // Remove from Stripe customer
    await stripe.paymentMethods.detach(stripeCardId);

    // Remove from wallet
    wallet.cards.splice(cardIndex, 1);

    // If the removed card was primary, optionally promote another to primary
    if (isPrimary && wallet.cards.length > 0) {
      wallet.cards[0].isPrimary = true;
      await stripe.customers.update(wallet.stripeCustomerId, {
        invoice_settings: { default_payment_method: wallet.cards[0].stripeCardId },
      });
    }

    await wallet.save();

    return res.status(200).json({
      success: true,
      message: "Card removed successfully.",
      cards: wallet.cards,
    });
  } catch (error) {
    console.error("❌ Error in removeCard:", error);
    next(new ErrorHandler(error.message || "Failed to remove card", 500));
  }
};



// POST /api/wallet/add-funds
export const addFundsToWallet = async (req, res, next) => {
  try {
    const { userId, amount, billingInfo, credits } = req.body;

    if (!userId || !amount) {
      return next(new ErrorHandler("User ID and amount are required", 400));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return next(new ErrorHandler("Wallet not found", 404));
    }

    const primaryCard = wallet.cards.find((card) => card.isPrimary);
    if (!primaryCard) {
      return next(new ErrorHandler("No primary card found. Please add a billing method first.", 400));
    }

    // Optional: Basic validation for billingInfo
    const requiredFields = ["street", "postalCode", "city", "country"];
    for (const field of requiredFields) {
      if (!billingInfo?.[field]) {
        return next(new ErrorHandler(`Billing field "${field}" is required.`, 400));
      }
    }

   // Create payment intent in EUR
const paymentIntent = await stripe.paymentIntents.create({
  amount: Math.round(amount * 100),
  currency: "eur", // changed to euro
  customer: wallet.stripeCustomerId,
  payment_method: primaryCard.stripeCardId,
  off_session: true,
  confirm: true,
description: `Purchased ${credits.reduce((sum, c) => sum + Number(c.credits), 0)} credits for €${amount.toFixed(2)} to top up the credit balance.`,

  metadata: {
    userId: user._id.toString(),
    email: user.email,
   creditsPurchased: JSON.stringify(credits),
    purpose: "wallet_topup",
  },
});

    if (paymentIntent.status !== "succeeded") {
      return next(new ErrorHandler("Stripe payment failed", 402));
    }

    // Update wallet balance and log transaction
   wallet.balance += amount;
wallet.transactions.push({
  type: "credit",
  amount,
  currency: "EUR",
  credits,
description: `Purchased ${credits.reduce((sum, c) => sum + Number(c.credits), 0)} credits for €${amount.toFixed(2)} to top up the credit balance.`,

  stripePayment: {
    id: paymentIntent.id,
    amount: paymentIntent.amount / 100,
    currency: paymentIntent.currency,
    payment_method: paymentIntent.payment_method,
    receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || null,
    created: paymentIntent.created,
    status: paymentIntent.status,
  },
  billingInfo: {
    street: billingInfo.street,
    postalCode: billingInfo.postalCode,
    city: billingInfo.city,
    country: billingInfo.country,
    companyName: billingInfo.companyName || "",
    vatNumber: billingInfo.vatNumber || "",
  },
});
    await wallet.save();

    return res.status(200).json({
      success: true,
      message: "Funds added successfully to wallet.",
      wallet: {
        balance: wallet.balance,
        transactions: wallet.transactions,
      },
      stripePayment: {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        payment_method: paymentIntent.payment_method,
        receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || null,
        created: paymentIntent.created,
      },
    });

  } catch (error) {
    if (error.code === "authentication_required") {
      return next(new ErrorHandler("Authentication required for card. Please re-authenticate.", 402));
    }

    console.error("❌ Error in addFundsToWallet:", error);
    next(new ErrorHandler(error.message || "Failed to add funds.", 500));
  }
};


export const withdrawFunds = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount || isNaN(amount) || amount <= 0) {
      return next(new ErrorHandler("User ID and valid amount are required", 400));
    }

    const user = await User.findById(userId);
    if (!user) return next(new ErrorHandler("User not found", 404));

    // Ensure Stripe Connect account exists
    const { accountId, onboardingUrl } = await ensureStripeConnectAccount(user);

    if (!accountId) {
      return next(new ErrorHandler("Failed to create Stripe account", 500));
    }

    // If onboarding is required (new account), return the onboarding URL
    if (onboardingUrl) {
      return res.status(200).json({
        success: false,
        requiresOnboarding: true,
        message: "Stripe onboarding required.",
        onboardingUrl,
      });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return next(new ErrorHandler("Wallet not found", 404));

    if (wallet.balance < amount) {
      return next(new ErrorHandler("Insufficient balance.", 400));
    }

    // Create the payout
    const payout = await stripe.transfers.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      destination: accountId,
      description: `Withdrawal for ${user.firstName} (${user.email})`,
      metadata: {
        userId: user._id.toString(),
        purpose: "wallet_withdrawal",
      },
    });

    // Deduct from wallet
    wallet.balance -= amount;
    wallet.transactions.push({
      type: "debit",
      amount,
      description: "Wallet Withdrawal",
    });

    await wallet.save();

    res.status(200).json({
      success: true,
      message: "Withdrawal processed successfully.",
      stripeTransfer: payout,
      wallet: {
        balance: wallet.balance,
        transactions: wallet.transactions,
      },
    });

  } catch (error) {
    console.error("❌ Error in withdrawFunds:", error);
    next(new ErrorHandler(error.message || "Withdrawal failed.", 500));
  }
};

const ensureStripeConnectAccount = async (user) => {
  // If user already has a Stripe account ID, return it
  if (user.stripeAccountId) {
    return { accountId: user.stripeAccountId };
  }

  // Create Express Stripe Connect account
  const account = await stripe.accounts.create({
    type: "express", // ✅ express for embedded onboarding
    country: "MY", // Change to "US" if testing internationally
    email: user.email,
    business_type: "individual",
    capabilities: {
      transfers: { requested: true }, // Needed for payouts
    },
  });

  // Save account ID to user
  user.stripeAccountId = account.id;
  await user.save();

  // Create onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.CLIENT_URL}/settings/billing`,
    return_url: `${process.env.CLIENT_URL}/settings/billing`,
    type: "account_onboarding",
  });

  return {
    accountId: account.id,
    onboardingUrl: accountLink.url,
  };
};


const countryMap = {
  "United States": "US",
  "Pakistan": "PK",
  "United Kingdom": "GB",
  "India": "IN",
  "Canada": "CA",
  "Germany": "DE",
  "France": "FR",
  "Australia": "AU",
  "Brazil": "BR",
  "UAE": "AE",
  "Malaysia": "MY"
};

function getISOCode(countryName) {
  if (!countryName) return null;
  return countryMap[countryName.trim()] || null;
}

