import { config } from "dotenv";
import express from "express";
import userRouter from "./routes/user.js";
import walletRouter from "./routes/wallet.js";
import uploadRouter from "./routes/b2Upload.js";
import couponRouter from "./routes/coupons.js";
import cartRouter from "./routes/cart.js";
import blogsRouter from "./routes/frontend/blogs.js";
import productRouter from "./routes/frontend/product.js";
import pagesRouter from "./routes/frontend/page.js";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.js";
import liveVisitorsRouter from "./routes/liveVisitors.js";
import mediaRouter from "./routes/frontend/media.js";
import reviewsRouter from "./routes/frontend/reviews.js";
import "./utils/exchangeRateService.js";
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
    origin: [process.env.FRONTEND_URL, "http://localhost:3000", "http://localhost:3001", "https://frontend-3d-exclusive.vercel.app", "http://frontend-3d-exclusive.vercel.app", "https://www.xclusive3d.com", "https://xclusive3d.com"],
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
app.use('/api/blogs', blogsRouter);
app.use('/api/products', productRouter);
app.use('/api/pages', pagesRouter);
app.use("/api/live-visitors", liveVisitorsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/media", mediaRouter);

app.get("/", (req, res) => {
  res.send("Nice working backend by Wajih ul Hassan for Xclusive3d.com");
});

// Using Error Middleware
app.use(errorMiddleware);
