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

import countries from 'i18n-iso-countries';
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
    // ✅ Step 1: Detect country
    const geoRes = await fetch(`https://ipwho.is/`);
    const geoData = await geoRes.json();
    const userCountry = geoData?.country_code;
    console.log(`🌍 Detected Country: ${userCountry}`);

    console.log("💰 Amount received (original):", req.body.amount);

    // ✅ Step 2: Map country → currency
    const currencyMap = {
      NL: 'eur',
      DE: 'eur',
      BE: 'eur',
      FR: 'eur',
      CN: 'cny',
      PK: 'pkr', // handled below
      US: 'usd',
      GB: 'gbp',
    };

    let currency = currencyMap[userCountry] || 'eur';

    // ✅ Step 3: Map country → payment methods
    const paymentMethodsMap = {
      NL: ['card', 'ideal','bancontact'],
      DE: ['sofort', 'card'],
      BE: ['bancontact', 'card'],
      FR: ['card'],
      CN: ['card'],
      PK: ['card', 'ideal','bancontact'], // Stripe PKR fallback handled below
      US: ['card'],
      GB: ['card'],
    };

    let paymentMethods = paymentMethodsMap[userCountry] || ['card', 'ideal','bancontact'];

    // ✅ Step 4: Handle PKR → USD fallback for Stripe
    if (currency === 'pkr') {
      currency = 'usd'; // Stripe doesn't support PKR
      const exchangeRate = 300; // example: 300 PKR = 1 USD
      req.body.amount = Math.round(req.body.amount / exchangeRate);
      console.log(`💱 PKR converted to USD: ${req.body.amount} USD`);
    }

    // ✅ Step 5: Convert to smallest unit for Stripe
    req.body.amount = req.body.amount * 100; // e.g., $20 → 2000 cents
    console.log(`📏 Amount in smallest unit: ${req.body.amount} ${currency}`);

    // // ✅ Step 6: Remove methods not supported by the currency
    if (currency !== 'eur') {
      paymentMethods = paymentMethods.filter(
        (m) => !['ideal', 'sofort', 'bancontact'].includes(m)
      );
    }

    console.log(`💳 Final Payment Methods: ${paymentMethods.join(', ')}`);

    // ✅ Step 7: Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: req.body.amount,
      currency,
      payment_method_types: paymentMethods,
      automatic_payment_methods: { enabled: false },
    });

    console.log(`✅ PaymentIntent Created: ${paymentIntent.id}`);

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentMethods,
      country: userCountry,
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
  const { userId, amount, billingInfo, credits, currencySymbol, usePrimaryCard, stripeCard , localPaymentMethod} = req.body;

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
    const totalAmount = amount + vatAmount;

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
    await wallet.save();

    // 🧾 Create invoice
    const invoiceNumber = await generateInvoiceNumber();
    await Invoice.create({
      invoiceNumber,
      user: user._id,
      credits,
      amount, // subtotal
      vat: vatAmount,
      total: totalAmount,
      vatRate,
    method: stripePaymentDetails.method,

      isReverseCharge,
      vatNote,
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
