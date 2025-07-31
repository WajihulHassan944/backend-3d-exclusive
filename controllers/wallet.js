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

    const primaryCard = wallet.cards.find(card => card.isPrimary);
    if (!primaryCard) {
      return next(new ErrorHandler("No primary card found. Please add a billing method first.", 400));
    }

    // 🧾 Validate billing fields
    const requiredFields = ["name", "street", "postalCode", "city", "country"];
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

    const rawCountry = billingInfo.country;
    console.log("🌍 Raw Country:", rawCountry);

    const countryCode = getCountryCode(rawCountry);
    console.log("🌐 Country Code:", countryCode);

    const vatNumber = billingInfo.vatNumber?.toUpperCase() || null;
    const isEU = isValidEUCountry(countryCode);
    console.log("🇪🇺 Is EU country:", isEU);
    console.log("🧾 VAT Number Provided:", vatNumber);

    if (countryCode === "NL") {
      vatRate = 0.21;
    } else if (isEU) {
      if (vatNumber) {
        const isValid = await validateVATNumber(vatNumber, countryCode);
        console.log("✅ VAT Number Valid:", isValid);
        if (isValid) {
          isReverseCharge = true;
          vatNote = "VAT reverse charged pursuant to Article 138 of Directive 2006/112/EC";
          vatRate = 0;
        } else {
          vatRate = 0.21;
        }
      } else {
        vatRate = 0.21;
      }
    } else {
      vatRate = 0;
    }

    // 💶 Calculate totals
    vatAmount = amount * vatRate;
    const totalAmount = amount + vatAmount;

    console.log("💸 Base Amount:", amount);
    console.log("📈 VAT Rate:", vatRate);
    console.log("💰 VAT Amount:", vatAmount);
    console.log("🧾 Total Charged to Customer:", totalAmount);

    // 📄 Prepare Stripe payment description
    const description = `Purchased ${credits.reduce((sum, c) => sum + Number(c.credits), 0)} credits for €${totalAmount.toFixed(2)} (incl. VAT)`;

    // 💳 Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(totalAmount * 100), // Stripe expects amount in cents
      currency: "eur",
      customer: wallet.stripeCustomerId,
      payment_method: primaryCard.stripeCardId,
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

    // 💰 Update wallet
    wallet.balance += amount; // only add the original amount to wallet
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
      method: primaryCard.brand,
      isReverseCharge,
      vatNote,
      currency: "EUR",
      stripePaymentId: paymentIntent.id,
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
    let vatAmount = 0;
    let isReverseCharge = false;
    let vatNote = '';
    let isValidVat = false;

    if (countryCode === 'NL') {
      vatRate = 0.21;
    } else if (isEU) {
      if (normalizedVat) {
        isValidVat = await validateVATNumber(normalizedVat, countryCode);
        if (isValidVat) {
          vatRate = 0;
          isReverseCharge = true;
          vatNote = 'VAT reverse charged pursuant to Article 138 of Directive 2006/112/EC';
        } else {
          vatRate = 0.21;
        }
      } else {
        vatRate = 0.21;
      }
    } else {
      vatRate = 0; // Outside EU
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
}

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
