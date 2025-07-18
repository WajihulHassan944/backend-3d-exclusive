import { User } from "../models/user.js";
import jwt from "jsonwebtoken";

export const isAuthenticated = async (req, res, next) => {
  const { token } = req.cookies;

  if (!token)
    return res.status(404).json({
      success: false,
      message: "Login First",
    });

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  req.user = await User.findById(decoded._id);
  next();
};

export const authenticateApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const apiKey = process.env.API_KEY;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Missing Authorization Header' });
  }

  const token = authHeader.split(' ')[1];

  if (token !== apiKey) {
    return res.status(403).json({ success: false, message: 'Invalid API Key' });
  }

  next();
};
