// utils/sendCookie.js
import jwt from "jsonwebtoken";

export const sendCookie = (
  user,
  res,
  message,
  statusCode = 200,
  data = {},
  redirectUrl = null
) => {
  const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

  res.cookie("token", token, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    sameSite: "none",
    secure: process.env.NODE_ENV === "Development" ? false : true,
  });

  if (redirectUrl) {
    // 🚀 Redirect flow
    return res.redirect(redirectUrl);
  }

  // Default: send JSON response
  return res.status(statusCode).json({
    success: true,
    message,
    ...data,
  });
};
