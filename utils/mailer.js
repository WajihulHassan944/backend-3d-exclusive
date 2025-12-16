import dotenv from "dotenv";
dotenv.config({ path: "./data/config.env" });

import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,     // smtp.transip.email
  port: Number(process.env.SMTP_PORT), // 465
  secure: true,                 
  auth: {
    user: process.env.SMTP_USER,   // noreply@xclusive3d.com
    pass: process.env.SMTP_PASS,   // password 
  },
});


