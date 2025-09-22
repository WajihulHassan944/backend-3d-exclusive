import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import ErrorHandler from "../middlewares/error.js";
import { Invoice } from "../models/invoice.js";
import { User } from "../models/user.js";
import { Wallet } from "../models/wallet.js";
import { generateInvoiceNumber } from "../utils/generateInvoiceNumber.js";
import stripe from "../utils/stripe.js";
import { isValidEUCountry, validateVATNumber } from "../utils/vat.js";
import mongoose from "mongoose";
import countries from 'i18n-iso-countries';
import Coupon from '../models/coupon.js';
const countryToCurrencyMap = {
  "Pakistan": "pkr",
  "United States": "usd",
  "United Kingdom": "gbp",
  "Germany": "eur",
  "France": "eur",
  "Netherlands": "eur",
  "India": "inr",
  "United Arab Emirates": "aed",
  "Canada": "cad",
  // ...add more if needed
};


// Setup for ES modules (__dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and register 'en' locale manually
const enLocaleRaw = readFileSync(
  path.resolve(__dirname, '../node_modules/i18n-iso-countries/langs/en.json'),
  'utf-8'
);
const enLocale = JSON.parse(enLocaleRaw);
countries.registerLocale(enLocale);

// Helper to get country code
export const getCountryCode = (countryName) => {
  if (!countryName) return null;
  return countries.getAlpha2Code(countryName, 'en');
};

// POST /api/wallet/create-setup-intent
export const createSetupIntent = async (req, res, next) => {
  try {
   const userAuth = req.user;
    const userId = userAuth._id;
    const user = await User.findById(userId);
    if(user){
      console.log("user found");
    }
    if (!user) return next(new ErrorHandler("User not found", 404));

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) return next(new ErrorHandler("Wallet not found", 404));

    // ✅ Step 1: Create Stripe customer if not exists
    if (!wallet.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });

      wallet.stripeCustomerId = customer.id;
      await wallet.save();
    }

    // ✅ Step 2: Create SetupIntent
    const setupIntent = await stripe.setupIntents.create({
      customer: wallet.stripeCustomerId,
      payment_method_types: ['card'],
    });

    return res.status(200).json({
      success: true,
      clientSecret: setupIntent.client_secret,
    });
  } catch (error) {
    console.error("❌ Error creating setup intent:", error);
    next(error);
  }
};

export const createPaymentIntentAllMethods = async (req, res, next) => {
  try {
    let amount = req.body.amount;              // e.g., 200
    let currency = (req.body.currencyCode || 'eur').toLowerCase(); // e.g., "pkr"

    console.log("💰 Amount received (original):", amount);
    console.log("user country Code is", req.body.countryCode);
    console.log("currency is", currency);

    // ✅ Convert to smallest unit for Stripe
    amount = Math.round(amount * 100); // e.g., 200 PKR → 20000 paisa
    console.log(`📏 Amount in smallest unit: ${amount} ${currency}`);

    // ✅ Create PaymentIntent with automatic local methods
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true }, // Stripe picks supported methods
    });

    console.log(`✅ PaymentIntent Created: ${paymentIntent.id}`);

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      currency,
    });

  } catch (error) {
    console.error('❌ Error creating payment intent:', error);
    next(error);
  }
};


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


export const addFundsToWallet = async (req, res, next) => {
  try {
  const { userId, amount, billingInfo, credits,discountAmount, currencySymbol, usePrimaryCard, stripeCard , localPaymentMethod, coupon} = req.body;
console.log("Coupon data is", coupon);
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

    const primaryCard = wallet.cards.find(card => card.isPrimary);
    
    // 🧾 Validate billing fields
    const requiredFields = ["name", "street", "postalCode", "country"];
    for (const field of requiredFields) {
      if (!billingInfo?.[field]) {
        return next(new ErrorHandler(`Billing field "${field}" is required.`, 400));
      }
    }

    // 🏛️ EU VAT handling
    let vatRate = 0;
    let isReverseCharge = false;
    let vatNote = "";
    let vatAmount = 0;

   const rawCountry = billingInfo.country || user.country;
const stripeCurrency = countryToCurrencyMap[rawCountry] || "eur";
    console.log("🌍 Raw Country:", rawCountry);

    const countryCode = getCountryCode(rawCountry);
    console.log("🌐 Country Code:", countryCode);

    const vatNumber = billingInfo.vatNumber?.toUpperCase() || null;
    const isEU = isValidEUCountry(countryCode);
    console.log("🇪🇺 Is EU country:", isEU);
    console.log("🧾 VAT Number Provided:", vatNumber);

       if (isEU) {
      if (vatNumber) {
        const isValidVat = await validateVATNumber(vatNumber, countryCode);
        console.log("✅ VAT Number Valid:", isValidVat);
        if (isValidVat) {
          vatRate = 0;
          isReverseCharge = true;
          vatNote = "VAT reverse charged pursuant to Article 138 of Directive 2006/112/EC";
        } else {
          vatRate = 0.21;
        }
      } else {
        vatRate = 0.21;
      }
    } else {
      vatRate = 0;
      vatNote = "VAT-exempt export of services outside the EU – Article 6(2) Dutch VAT Act";
    }


    // 💶 Calculate totals
    vatAmount = amount * vatRate;
    const totalAmount = amount + vatAmount - discountAmount;

    console.log("💸 Base Amount:", amount);
    console.log("📈 VAT Rate:", vatRate);
    console.log("💰 VAT Amount:", vatAmount);
    console.log("🧾 Total Charged to Customer:", totalAmount);

    // 📄 Prepare Stripe payment description
    const description = `Purchased ${credits.reduce((sum, c) => sum + Number(c.credits), 0)} credits for ${currencySymbol} ${totalAmount.toFixed(2)} (incl. VAT)`;

   let stripePaymentDetails = null;

let selectedCard = null;

if (stripeCard === true) {
  // Use most recently added card
  selectedCard = wallet.cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
} else if (usePrimaryCard) {
  selectedCard = wallet.cards.find(card => card.isPrimary);
}

if (selectedCard) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: stripeCurrency,
    customer: wallet.stripeCustomerId,
    payment_method: selectedCard.stripeCardId,
    off_session: true,
    confirm: true,
    description,
    metadata: {
      userId: user._id.toString(),
      email: user.email,
      creditsPurchased: JSON.stringify(credits),
      purpose: "wallet_topup",
      vatRate: vatRate.toString(),
      reverseCharge: isReverseCharge.toString(),
      countryCode,
      vatNumber: vatNumber || "none",
      totalCharged: totalAmount.toString(),
    },
  });

  if (paymentIntent.status !== "succeeded") {
    return next(new ErrorHandler("Stripe payment failed", 402));
  }

  stripePaymentDetails = {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    payment_method: paymentIntent.payment_method,
    receipt_url: paymentIntent.charges?.data?.[0]?.receipt_url || null,
    created: paymentIntent.created,
    method: selectedCard.brand,
  };
}
 else {
  // User paid via another method (e.g., iDEAL, Bancontact, Alipay)
  // We assume payment is already handled via Stripe Elements setup
  stripePaymentDetails = {
    id: "manual-element",
    amount: Math.round(totalAmount * 100),
    currency: stripeCurrency,
    status: "succeeded",
    payment_method: "element",
    receipt_url: null,
    created: Date.now(),
   method: localPaymentMethod || "Stripe Element",
  };
}

const totalCreditsToAdd = credits.reduce((sum, credit) => {
  return sum + Number(credit.credits);
}, 0); 

wallet.balance = Number(wallet.balance) + totalCreditsToAdd;
wallet.totalPurchased = Number(wallet.totalPurchased || 0) + totalCreditsToAdd; 
    await wallet.save();

    if (coupon && coupon.code) {
  const foundCoupon = await Coupon.findOne({ code: coupon.code });
  if (foundCoupon) {
    foundCoupon.usageCount += 1;
    foundCoupon.usedBy.push({ userId: user._id, email: user.email });
    await foundCoupon.save();
  }
}

    // 🧾 Create invoice
    const invoiceNumber = await generateInvoiceNumber();
    await Invoice.create({
      invoiceNumber,
      user: user._id,
      credits: credits.map(c => ({
    ...c,
    addedAt: new Date(),
    expiryAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // 1 year expiry
    reason: "Wallet top-up purchase", // default reason
    isManual: false, // since this is a normal payment
  })),
      amount, // subtotal
      vat: vatAmount,
      total: totalAmount,
      vatRate,
    method: stripePaymentDetails.method,
priceBeforeDiscount: req.body.priceBeforeDiscount,
  couponCode: req.body.coupon?.code || null, // ✅ save applied coupon
      isReverseCharge,
      vatNote,
      discountAmount,
     currency: currencySymbol || "EUR",

     stripePaymentId: stripePaymentDetails.id,

      billingInfo: {
        name: billingInfo.name,
        street: billingInfo.street,
        postalCode: billingInfo.postalCode,
        city: billingInfo.city,
        country: countryCode,
        countryName: rawCountry,
        companyName: billingInfo.companyName || "",
        vatNumber,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Funds added successfully to wallet.",
      wallet: {
        balance: wallet.balance,
      },
     stripePayment: stripePaymentDetails

    });

  } catch (error) {
    if (error.code === "authentication_required") {
      return next(new ErrorHandler("Authentication required for card. Please re-authenticate.", 402));
    }

    console.error("❌ Error in addFundsToWallet:", error);
    next(new ErrorHandler(error.message || "Failed to add funds.", 500));
  }
};

export const getVat = async (req, res, next) => {
  try {
    const { vatNumber, country } = req.body;

    if (!country) {
      return res.status(400).json({ success: false, message: 'Country is required.' });
    }

    const countryCode = getCountryCode(country);
    const isEU = isValidEUCountry(countryCode);
    const normalizedVat = vatNumber?.toUpperCase() || null;

    let vatRate = 0;
    let isReverseCharge = false;
    let vatNote = '';
    let isValidVat = false;

    if (isEU) {
      if (normalizedVat) {
        isValidVat = await validateVATNumber(normalizedVat, countryCode);
        if (isValidVat) {
          vatRate = 0;
          isReverseCharge = true;
          vatNote = 'VAT reverse charged pursuant to Article 138 of Directive 2006/112/EC';
        } else {
          // Invalid VAT – treat as consumer
          vatRate = countryCode === 'NL' ? 0.21 : 0.21; // You can later replace 0.21 with dynamic per-country rate
        }
      } else {
        // No VAT number – treat as consumer
        vatRate = countryCode === 'NL' ? 0.21 : 0.21;
      }
    } else {
      // Outside EU – no VAT
      vatRate = 0;
      vatNote = 'VAT-exempt export of services outside the EU – Article 6(2) Dutch VAT Act';
    }

    return res.status(200).json({
      success: true,
      vatRate,
      isEU,
      isReverseCharge,
      isValidVat,
      vatNote,
    });
  } catch (error) {
    console.error('❌ VAT Check Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to validate VAT number.' });
  }
};


export const getWalletByUserId = async (req, res, next) => {
  try {

    const wallet = await Wallet.find();

    if (!wallet) {
      return next(new ErrorHandler("Wallet not found", 404));
    }

    res.status(200).json({
      success: true,
      wallet,
    });
  } catch (error) {
    next(error);
  }
};




export const validateVATfunc = async (req, res) => {
  try {
    const { vatNumber, countryCode } = req.body;

    if (!vatNumber || !countryCode) {
      return res.status(400).json({ success: false, message: "vatNumber and countryCode are required." });
    }

    const isValid = await validateVATNumber(vatNumber, countryCode);

    return res.status(200).json({
      success: true,
      vatNumber,
      countryCode,
      isValid
    });
  } catch (error) {
    console.error("Error validating VAT:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



export const getAllCustomersCredits = async (req, res) => {
  try {
    const users = await User.find({});
    const wallets = await Wallet.find({}).populate("userId");
    const invoices = await Invoice.find({}).populate("user");

    const data = users
      .map(user => {
        const wallet = wallets.find(
          w => w.userId && w.userId._id.toString() === user._id.toString()
        );
        const userInvoices = invoices.filter(
          inv => inv.user && inv.user._id.toString() === user._id.toString()
        );

        // fallback if wallet not found
        const remaining = wallet?.balance || 0;
        let totalPurchased = wallet?.totalPurchased || 0;
        let expiryDate = null;

        // expiry logic still based on invoice credits
        userInvoices.forEach(inv => {
          inv.credits.forEach(c => {
            if (c.addedAt) {
              const candidateExpiry = new Date(c.addedAt);
              candidateExpiry.setFullYear(candidateExpiry.getFullYear() + 1);

              if (!expiryDate || candidateExpiry > expiryDate) {
                expiryDate = candidateExpiry;
              }
            }
          });
        });

        // usage calculation
        let used = totalPurchased - remaining;
        if (used < 0) used = 0;

        const usagePercent =
          totalPurchased > 0 ? Math.round((used / totalPurchased) * 100) : 0;

        return {
          id: user._id,
          customer: `${user.firstName} ${user.lastName || ""}`.trim(),
          email: user.email,
          company: userInvoices?.[0]?.billingInfo?.companyName || "",
          creditsUsage: `${used} / ${totalPurchased} (${usagePercent}%)`,
          totalPurchased,
          remaining,
          expiryDate: expiryDate ? expiryDate.toISOString().split("T")[0] : null,
          status: remaining > 0 ? "Active" : "Inactive",
        };
      })
      // filter out users with no credits at all
      .filter(
        c => !(c.remaining === 0 && c.totalPurchased === 0)
      );

    res.json(data);
  } catch (err) {
    console.error("Error fetching customers:", err);
    res.status(500).json({ error: "Server error" });
  }
};






/**
 * Admin: Add credits to a customer
 */
export const addCredits = async (req, res) => {
  try {
    const { userId, credits, reason } = req.body;

    if (!userId || !credits) {
      return res.status(400).json({ error: "userId and credits are required" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    // add credits to wallet
    wallet.balance += credits;
    wallet.totalPurchased += credits;
    await wallet.save();

    // create manual invoice entry
    const invoice = new Invoice({
      invoiceNumber: `MAN-${Date.now()}`, // manual ID
      user: new mongoose.Types.ObjectId(userId),
      credits: [
        {
          credits,
          addedAt: new Date(),
          expiryAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          reason: reason || "Manual credit addition",
          isManual: true,
        },
      ],
      amount: 0,
      vat: 0,
      vatRate: 0,
      isReverseCharge: false,
      vatNote: "",
      method: "manual",
      total: 0,
      currency: "CREDITS",
    });

    await invoice.save();

    res.json({ message: "Credits added successfully", wallet, invoice });
  } catch (err) {
    console.error("Error adding credits:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * Admin: Remove credits from a customer
 */
export const removeCredits = async (req, res) => {
  try {
    const { userId, credits, reason } = req.body;

    if (!userId || !credits) {
      return res.status(400).json({ error: "userId and credits are required" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    if (wallet.balance < credits) {
      return res.status(400).json({ error: "Insufficient credits" });
    }

    // deduct credits
    wallet.balance -= credits;
    await wallet.save();

    // log manual removal in invoice
    const invoice = new Invoice({
      invoiceNumber: `MAN-${Date.now()}`, 
      user: new mongoose.Types.ObjectId(userId),
      credits: [
        {
          credits: -credits, // negative to indicate deduction
          addedAt: new Date(),
          expiryAt: new Date(), // immediate
          reason: reason || "Manual credit deduction",
          isManual: true,
        },
      ],
      amount: 0,
      vat: 0,
      vatRate: 0,
      isReverseCharge: false,
      vatNote: "",
      method: "manual",
      total: 0,
      currency: "CREDITS",
    });

    await invoice.save();

    res.json({ message: "Credits removed successfully", wallet, invoice });
  } catch (err) {
    console.error("Error removing credits:", err);
    res.status(500).json({ error: "Server error" });
  }
};




export const getCreditsStats = async (req, res) => {
  try {
    const users = await User.find({});
    const wallets = await Wallet.find({}).populate("userId");
    const invoices = await Invoice.find({}).populate("user");

    let totalActiveCredits = 0;
    let expiringSoon = 0;
    let expiredCredits = 0;
    let totalCustomers = 0;

    const now = new Date();

    users.forEach(user => {
      const wallet = wallets.find(
        w => w.userId && w.userId._id.toString() === user._id.toString()
      );
      const userInvoices = invoices.filter(
        inv => inv.user && inv.user._id.toString() === user._id.toString()
      );

      let totalPurchased = 0;
      let expiryDate = null;

      userInvoices.forEach(inv => {
        inv.credits.forEach(c => {
          totalPurchased += c.credits;

          if (c.addedAt) {
            const candidateExpiry = new Date(c.addedAt);
            candidateExpiry.setFullYear(candidateExpiry.getFullYear() + 1);

            if (!expiryDate || candidateExpiry > expiryDate) {
              expiryDate = candidateExpiry;
            }
          }
        });
      });

      const remaining = wallet?.balance || 0;

      // only count customers with actual purchased credits
      if (!(remaining === 0 && totalPurchased === 0)) {
        totalCustomers++;
        totalActiveCredits += remaining;

        if (expiryDate) {
          if (expiryDate < now) {
            expiredCredits++;
          } else {
            const daysLeft = (expiryDate - now) / (1000 * 60 * 60 * 24);
            if (daysLeft <= 30) {
              expiringSoon++;
            }
          }
        }
      }
    });

    res.json({
      totalActiveCredits,
      expiringSoon,
      expiredCredits,
      totalCustomers,
    });
  } catch (err) {
    console.error("Error fetching credit stats:", err);
    res.status(500).json({ error: "Server error" });
  }
};













export const getAllOrders = async (req, res) => {
  try {
    const invoices = await Invoice.find({})
      .populate("user") // bring in user info
      .sort({ createdAt: -1 }); // latest first

    const data = invoices.map((inv, idx) => {
      const customerName = `${inv.user?.firstName || ""} ${inv.user?.lastName || ""}`.trim();

      // Order ID (ORD-001 style)
      const orderId = `ORD-${String(idx + 1).padStart(3, "0")}`;

      // total credits in this order
      const totalCredits = inv.credits?.reduce(
        (sum, c) => sum + (c.credits || 0),
        0
      ) || 0;

      return {
        _id: inv._id,
        orderId,
        customer: customerName,
        email: inv.user?.email || "",
        company: inv.billingInfo?.companyName || "",
        amount: inv.total ? inv.total.toFixed(0) : "0",
        currency: inv.currency || "€",
        credits: totalCredits,
        status: inv.status || "Completed", // e.g., pending, completed, failed
        date: inv.issuedAt ? inv.issuedAt.toISOString().split("T")[0] : null,

      };
    });

    res.json(data);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ error: "Server error" });
  }
};




export const getOrderStats = async (req, res) => {
  try {
    const now = new Date();
    let startDate, endDate = new Date(now);

    const { period = "this_week" } = req.query;

    if (period === "this_week") {
      // Monday of this week
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - startDate.getDay() + 1); 
    } else if (period === "last_week") {
      // Monday of last week
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - startDate.getDay() - 6); // last Monday
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === "last_month") {
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      // default this week
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
    }

    const invoices = await Invoice.find({
      issuedAt: { $gte: startDate, $lte: endDate }
    });

    const totalOrders = invoices.length;

    const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
      totalOrders,
      totalRevenue: totalRevenue.toFixed(2),
      avgOrderValue: avgOrderValue.toFixed(2),
      period
    });
  } catch (err) {
    console.error("Error fetching order stats:", err);
    res.status(500).json({ error: "Server error" });
  }
};export const createManualOrder = async (req, res, next) => {
  try {
    const {
      customerName,
      email,
      companyName,
      vatNumber,
      address,
      country,
      amount: rawAmount,
      credits: rawCredits,
    } = req.body;

    // ✅ Ensure numeric values
    const amount = Number(rawAmount);
    const credits = Number(rawCredits);

    if (!email || !amount || !credits) {
      return next(
        new ErrorHandler("Email, amount, and credits are required", 400)
      );
    }

    // ✅ Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return next(
        new ErrorHandler("Order can only be placed for registered user.", 400)
      );
    }

    const wallet = await Wallet.findOne({ userId: user._id });
    if (!wallet) {
      return next(new ErrorHandler("Wallet not found for this user", 404));
    }

    // ⚡ VAT calculation
    let vatRate = 0;
    let vatAmount = 0;
    let vatNote = "";
    let isReverseCharge = false;

    const countryCode = getCountryCode(country);
    const isEU = isValidEUCountry(countryCode);

    if (isEU) {
      if (vatNumber) {
        const isValidVat = await validateVATNumber(vatNumber, countryCode);
        if (isValidVat) {
          vatRate = 0;
          isReverseCharge = true;
          vatNote =
            "VAT reverse charged pursuant to Article 138 of Directive 2006/112/EC";
        } else {
          vatRate = 0.21;
        }
      } else {
        vatRate = 0.21;
      }
    } else {
      vatRate = 0;
      vatNote =
        "VAT-exempt export of services outside the EU – Article 6(2) Dutch VAT Act";
    }

    vatAmount = amount * vatRate;
    const totalAmount = amount + vatAmount;

    // ✅ Update wallet balance
    wallet.balance += credits;
    wallet.totalPurchased += credits;
    await wallet.save();

    // 🧾 Create invoice
    const invoiceNumber = await generateInvoiceNumber();
    const invoice = await Invoice.create({
      invoiceNumber,
      user: user._id,
      credits: [
        {
          amount,
          credits,
          addedAt: new Date(),
          expiryAt: new Date(
            new Date().setFullYear(new Date().getFullYear() + 1)
          ),
          reason: "Manual order placement by admin",
          isManual: true,
        },
      ],
      amount, // subtotal
      vat: vatAmount,
      vatRate,
      total: totalAmount,
      isReverseCharge,
      vatNote,
      method: "manual",
      currency: "EUR",
      billingInfo: {
        name: customerName,
        companyName: companyName || "",
        vatNumber: vatNumber || "",
        address: address || "", // ✅ now treated as string
        country: countryCode,
        countryName: country,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Manual order created successfully.",
      order: invoice,
      wallet: { balance: wallet.balance },
    });
  } catch (error) {
    console.error("❌ Error in createManualOrder:", error);
    next(
      new ErrorHandler(error.message || "Failed to create manual order.", 500)
    );
  }
};



export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ error: "Order not found" });
    }

    await Invoice.findByIdAndDelete(id);

    res.json({ message: "Order deleted successfully" });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ error: "Server error" });
  }
};
export const deleteCustomersCredits = async (req, res) => {
  try {
    // Hardcoded customer IDs to clean up
    const customerIds = [
      "68b1a45b85d670e1575d7755", // Wajih ul Hassan
      "68c037814d029ea89dc2787c", // Pieter van Groenewoud
    ];

    for (const userId of customerIds) {
      // Reset wallet
      await Wallet.updateOne(
        { userId },
        { $set: { balance: 0, totalPurchased: 0 } }
      );

      // Delete invoices
      await Invoice.deleteMany({ user: userId });
    }

    res.json({ message: "Customers credits and invoices deleted successfully" });
  } catch (err) {
    console.error("Error deleting customers data:", err);
    res.status(500).json({ error: "Server error" });
  }
};
