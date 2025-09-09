import { config } from "dotenv";
import express from "express";
import userRouter from "./routes/user.js";
import walletRouter from "./routes/wallet.js";
import uploadRouter from "./routes/b2Upload.js";
import couponRouter from "./routes/coupons.js";
import cartRouter from "./routes/cart.js";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.js";
import cors from "cors";

export const app = express();

config({
  path: "./data/config.env",
});

// Using Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: [process.env.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001", "https://frontend-3d-exclusive.vercel.app", "http://frontend-3d-exclusive.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);
// Using routes
app.use("/api/users", userRouter);
app.use("/api/auth", userRouter);
app.use("/api/wallet", walletRouter);
app.use('/api/b2', uploadRouter);
app.use('/api/cart', cartRouter);
app.use('/api/coupons', couponRouter);
app.get("/", (req, res) => {
  res.send("Nice working backend by Muhammad Furqan Wajih ul Hassan");
});

// Using Error Middleware
app.use(errorMiddleware);
