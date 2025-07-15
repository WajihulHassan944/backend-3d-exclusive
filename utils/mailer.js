
import dotenv from "dotenv";
dotenv.config({ path: "./data/config.env" });

import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  service: "Gmail", // or use "smtp.mailtrap.io", "SendGrid", etc.
  auth: {
    user: process.env.ADMIN_EMAIL,       // e.g. your Gmail: myemail@gmail.com
    pass: process.env.ADMIN_EMAIL_PASS,  // e.g. your App Password (for Gmail)
  },
});
