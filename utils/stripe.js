
import dotenv from "dotenv";
dotenv.config({ path: "./data/config.env" });

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export default stripe;
