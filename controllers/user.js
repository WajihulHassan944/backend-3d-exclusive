import { User } from "../models/user.js";
import bcrypt from "bcrypt";
import { sendCookie } from "../utils/features.js";
import ErrorHandler from "../middlewares/error.js";
import nodemailer from "nodemailer";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";
import { transporter } from "../utils/mailer.js";
import generateEmailTemplate from "../utils/emailTemplate.js";
import { Wallet } from "../models/wallet.js";
import stripe from "../utils/stripe.js";
import { Video } from '../models/b2Upload.js';
import { Cart } from "../models/cart.js";
import validator from 'validator'; // For email format checking
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Invoice } from "../models/invoice.js";
import appleSignin from "apple-signin-auth";

const r2Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true,
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});


const fetchGoogleProfile = async (accessToken) => {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch user info from Google");
  }

  return await res.json();
};


export const fetchAppleProfile = async (idToken, code) => {
  const clientID = process.env.APPLE_CLIENT_ID;

  // Helper to ensure the private key is formatted correctly
  const getApplePrivateKey = () =>
    process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");

  // 1️⃣ Verify identity token (JWT from Apple)
  const decoded = await appleSignin.verifyIdToken(idToken, {
    audience: clientID,
    ignoreExpiration: false,
  });

  // 2️⃣ Exchange auth code for access/refresh token (if code is present)
  let tokens = null;
  if (code) {
    tokens = await appleSignin.getAuthorizationToken(code, {
      clientID,
      clientSecret: appleSignin.getClientSecret({
        clientID,
        teamID: process.env.APPLE_TEAM_ID,
        privateKey: getApplePrivateKey(),
        keyIdentifier: process.env.APPLE_KEY_ID,
      }),
    });
  }

  // 3️⃣ Return structured profile
  return {
    email: decoded.email,
    email_verified: decoded.email_verified,
    sub: decoded.sub, // Apple's unique user identifier
    tokens,
  };
};


export const appleAuth = async (req, res, next) => {
  const { code, country } = req.body;
  const idToken = req.body.id_token;
console.log("Req body is", req.body);
  try {
    const profile = await fetchAppleProfile(idToken, code);
    const { email, sub } = profile;

 let user = await User.findOne({ email }) || await User.findOne({ appleId: sub });

    if (user) {
      // ✅ Existing user → treat as login
      if (!user.verified) {
        return next(new ErrorHandler("Account is not verified.", 403));
      }

      return sendCookie(user, res, `Welcome back, ${user.firstName}`, 200, {
        user: {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          profileUrl: user.profileUrl,
          email: user.email,
          country: user.country,
          verified: user.verified,
          createdAt: user.createdAt,
        },
      });
    }

    // 🆕 New user → treat as register
    user = await User.create({
      firstName: "Apple", // Apple often only returns email
      lastName: "User",
      email,
      appleId: sub,
      country: country || "Unknown",
      verified: true,
      isNotificationsEnabled: true,
      isSubscribed: true,
      isAgreed: true,
    });

    // Create Stripe wallet
    const stripeCustomer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
    });

    await Wallet.create({
      userId: user._id,
      stripeCustomerId: stripeCustomer.id,
      balance: 0,
      cards: [],
      transactions: [],
    });

    // Send welcome email
    const welcomeHtml = generateEmailTemplate({
      firstName: user.firstName,
      subject: "Welcome to Xclusive 3D!",
      content: `<p>Hi ${user.firstName}, you signed up with Apple ID 🎉</p>`,
    });

    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Welcome to Xclusive 3D – Sign in with Apple",
      html: welcomeHtml,
    });

    // Notify Admin
    await transporter.sendMail({
      from: `"Xclusive 3D Notifications" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "🚀 New Apple Signup – Xclusive 3D",
      html: `<p>New user signed up with Apple: ${user.email}</p>`,
    });

    return sendCookie(user, res, `Welcome ${user.firstName}`, 201, {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileUrl: user.profileUrl,
        email: user.email,
        country: user.country,
        verified: user.verified,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Apple Auth Error:", error);
    next(new ErrorHandler("Apple Authentication Failed", 500));
  }
};

export const googleRegister = async (req, res, next) => {
  const { token, country } = req.body;

  try {
    const profile = await fetchGoogleProfile(token);
    const { name, email, picture } = profile;

    let user = await User.findOne({ email });

    if (user) {
      return next(new ErrorHandler("User already exists. Please login.", 400));
    }

    const [firstName, lastName = ""] = name.split(" ");

    user = await User.create({
      firstName,
      lastName,
      email,
      country: country || 'Unknown',
      profileUrl: picture,
      verified: true,
      isNotificationsEnabled: true,
      isSubscribed: true,
      isAgreed: true,
    });

    const stripeCustomer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
    });

    await Wallet.create({
      userId: user._id,
      stripeCustomerId: stripeCustomer.id,
      balance: 0,
      cards: [],
      transactions: [],
    });

    // ✅ Branded Welcome Email (Xclusive 3D)
    const welcomeHtml = generateEmailTemplate({
      firstName: user.firstName,
      subject: 'Experience 3D Like Never Before!',
      content: `
        <h2 style="color:#ffffff;">Hi ${user.firstName},</h2>
        <p>Welcome to <strong>Xclusive 3D</strong> — where your 2D videos are transformed into stunning, immersive 3D experiences automatically.</p>
        <p>You're now part of a revolution in content transformation. Explore our tools and discover how effortless creating jaw-dropping 3D visuals can be.</p>
        <p><strong>Let’s make your videos come to life — in 3D!</strong></p>
      `
    });

    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Welcome to Xclusive 3D – Convert Your Videos to Stunning 3D",
      html: welcomeHtml,
    });

    // ✅ Notify Admin
    const adminNotificationHtml = generateEmailTemplate({
      firstName: "Admin",
      subject: "New User Joined Xclusive 3D",
      content: `
        <p>A new user signed up via Google:</p>
        <ul>
          <li><strong>Name:</strong> ${user.firstName} ${user.lastName}</li>
          <li><strong>Email:</strong> ${user.email}</li>
          <li><strong>Country:</strong> ${user.country}</li>
        </ul>
      `
    });

    await transporter.sendMail({
      from: `"Xclusive 3D Notifications" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: "🚀 New Google Signup – Xclusive 3D",
      html: adminNotificationHtml,
    });

    sendCookie(user, res, `Welcome ${user.firstName}`, 201);

  } catch (error) {
    console.error("Google Register Error:", error);
    next(new ErrorHandler("Google Registration Failed", 500));
  }
};

export const googleLogin = async (req, res, next) => {
  const { token } = req.body;

  try {
    const profile = await fetchGoogleProfile(token);
    const { email, name, picture } = profile;

    const user = await User.findOne({ email });

    if (!user) {
      return next(new ErrorHandler("User not found. Please register.", 404));
    }

    if (!user.verified) {
      return next(new ErrorHandler("Account is not verified.", 403));
    }

    sendCookie(user, res, `Welcome back, ${user.firstName}`, 200, {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileUrl: user.profileUrl || picture,
        email: user.email,
        country: user.country,
        verified: user.verified,
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    console.error("Google Login Error:", error.message);
    next(new ErrorHandler("Google Login Failed", 500));
  }
};



export const deleteUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return next(new ErrorHandler('User not found', 404));

    // Delete profile image from Cloudinary
    if (user.profileUrl) {
      const segments = user.profileUrl.split('/');
      const publicIdWithExtension = segments[segments.length - 1];
      const publicId = publicIdWithExtension.split('.')[0];
      await cloudinary.uploader.destroy(`user_profiles/${publicId}`);
    }

    // Delete all user videos and files from R2
    const videos = await Video.find({ user: id });
    for (const video of videos) {
      const r2Keys = [];

      // Extract R2 key from b2Url
      if (video.b2Url) {
        const key = new URL(video.b2Url).pathname.slice(1); // remove leading slash
        r2Keys.push(key);
      }

      // Extract R2 key from convertedUrl if exists
      if (video.convertedUrl) {
        const key = new URL(video.convertedUrl).pathname.slice(1);
        r2Keys.push(key);
      }

      for (const key of r2Keys) {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }));
      }
    }

    // Delete videos from MongoDB
    await Video.deleteMany({ user: id });

    // Delete wallet
    await Wallet.findOneAndDelete({ userId: id });

    // Delete cart/credits
    await Cart.findOneAndDelete({ user: id });

    // Finally, delete user
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.firstName} ${user.lastName} and all associated data deleted successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return next(new ErrorHandler("Invalid Email or Password", 400));
    }

    // Check if user is not verified
    if (!user.verified) {
      return res.status(403).json({
        success: false,
        message: "Account not verified.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return next(new ErrorHandler("Invalid Email or Password", 400));
    }


    const cleanedUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      profileUrl: user.profileUrl,
      email: user.email,
      country: user.country,
      verified: user.verified,
      createdAt: user.createdAt,
    };

    sendCookie(user, res, "Login Successful", 200, { user: cleanedUser });

  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find(); // Fetch all users

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    next(error);
  }
};



export const register = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      country,
      subscribeNewsletter,
    } = req.body;
    const existingUser = await User.findOne({ email });

    
    // Normal new user flow
    if (existingUser) return next(new ErrorHandler("User Already Exists", 400));
    
    const hashedPassword = await bcrypt.hash(password, 10);

 


    let profileUrl = "";
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const cloudinaryUpload = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "user_profiles" },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });
      profileUrl = cloudinaryUpload.secure_url;
    } else {
  profileUrl = "https://res.cloudinary.com/daflot6fo/image/upload/v1752757070/one_ju3l12.png";
}

    const newUserData = {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      country,
      profileUrl,
       newsletterOptIn: subscribeNewsletter === 'true',
    };

   
    const user = await User.create(newUserData);
if (subscribeNewsletter === 'true') {
  try {
    const res = await fetch(`https://connect.mailerlite.com/api/subscribers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.MAILER_LITE}`,
      },
      body: JSON.stringify({
        email,
        name: `${firstName} ${lastName}`.trim(),
        groups: ['160816159398036489'], // ✅ your group ID
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('MailerLite subscription failed:', data);
    } else {
      console.log('MailerLite subscription successful:', data);
    }
  } catch (err) {
    console.error('MailerLite request error:', err.message);
  }
}


    const stripeCustomer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
    });

    const newWallet = await Wallet.create({
      userId: user._id,
      stripeCustomerId: stripeCustomer.id,
      balance: 0,
      cards: [],
      transactions: [],
    });




   if (user) {
  
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
  const verificationLink = `https://backend-3d-exclusive.vercel.app/api/users/verify-email?token=${token}`;
await transporter.sendMail({
  from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
  to: email,
  subject: "Verify Your Email",
  html: generateEmailTemplate({
    firstName,
    subject: "Verify Your Xclusive 3D Account",
    content: `
      <p style="margin-bottom:16px;">Hello ${firstName},</p>
      <p style="margin-bottom:16px;">Thanks for signing up on <strong>Xclusive 3D</strong>. To activate your account and get started with 3D video conversions, please verify your email address below:</p>

      <div style="margin:30px 0;text-align:center;">
        <a href="${verificationLink}" style="padding:10px 20px; background:#FF5722; color:white; border-radius:6px; text-decoration:none; font-size:14px;">
          Verify Email
        </a>
      </div>

      <p style="font-size:14px; color:#666;">If you didn’t create this account, you can safely ignore this email.</p>
    `,
  }),
});

}


    res.status(201).json({
      success: true,
      message: "Registration successful. Please verify your email.",
      user: {
        _id: user._id,
        firstName,
        lastName,
        email,
        country,
        verified: user.verified,
        profileUrl,
        createdAt: user.createdAt,
      },
    });

  } catch (error) {
    next(error);
  }
};



export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) return next(new ErrorHandler("Invalid or expired verification link", 400));

    if (user.verified) {
      return res.redirect("https://frontend-3d-exclusive.vercel.app/status?verified=already");
    }

    user.verified = true;
    await user.save();

    res.redirect("https://frontend-3d-exclusive.vercel.app/status?verified=success");
  } catch (error) {
    console.error(error);
    res.redirect("https://frontend-3d-exclusive.vercel.app/status?verified=fail");
  }
};


export const getMyProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const userId = user._id;

    const wallet = await Wallet.findOne({ userId });
    const videos = await Video.find({ user: userId }).sort({ createdAt: -1 });
    const cart = await Cart.findOne({ user: userId });
    const invoices = await Invoice.find({ user: userId }).sort({ issuedAt: -1 });
    res.status(200).json({
      success: true,
      user,
      wallet,
      videos,
      cart,
      invoices
    });
  } catch (error) {
    next(error);
  }
};

export const logout = (req, res) => {
  const nodeEnv = process.env.NODE_ENV;
  const sameSite = nodeEnv === "development" ? "lax" : "none";
  const secure = nodeEnv === "development" ? false : true;
  const currentToken = req.cookies?.token;

  console.log("=== Logout Debug Info ===");
  console.log("NODE_ENV:", nodeEnv);
  console.log("SameSite:", sameSite);
  console.log("Secure:", secure);
  console.log("Current token cookie (if any):", currentToken);

  res
    .status(200)
    .cookie("token", "", {
      expires: new Date(Date.now()),
      sameSite,
      secure,
      httpOnly: true,
    })
    .json({
      success: true,
      user: req.user,
      message: "Token cleared on logout",
      debug: {
        NODE_ENV: nodeEnv,
        sameSite,
        secure,
        receivedToken: currentToken,
      },
    });
};



export const getUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "firstName lastName email profileUrl country verified"
    );

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};




export const resetPasswordRequest = async (req, res, next) => {
  try {
    const { email, currentPassword } = req.body;

    // Find the user by email
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(404).json({ message: "No user found with this email." });
    }

    // Validate current password
    const isMatch = await bcrypt.compare(currentPassword, user.password || "");
    if (!isMatch) {
      return res.status(401).json({ message: "Incorrect current password." });
    }

    // Generate reset token (1-hour expiry)
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const resetLink = `http://dotask-service-marketplace.vercel.app/reset-password?token=${resetToken}`;

    // Compose email
    const mailOptions = {
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Password Reset Request",
      html: generateEmailTemplate({
        firstName: user.firstName,
        subject: "Reset Your Password",
        content: `
          <p>Hello ${user.firstName},</p>
          <p>You requested a password reset. Click the button below to continue:</p>
          <div style="margin:30px 0;text-align:center;">
            <a href="${resetLink}" style="display:inline-block;padding:12px 25px;background-color:#007bff;color:#fff;text-decoration:none;border-radius:5px;font-size:16px;">
              Reset Password
            </a>
          </div>
          <p>This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        `,
      }),
    };

    // Send email and handle errors
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error("❌ Error sending reset email:", err);
        return res.status(500).json({ message: "Failed to send reset email. Please try again later." });
      } else {
        console.log("✅ Reset email sent:", info.response);
        return res.status(200).json({ message: "Password reset link sent to your email." });
      }
    });

  } catch (error) {
    console.error("🚨 resetPasswordRequest error:", error);
    next(error);
  }
};

export const resetPasswordRequestEmail = async (req, res, next) => {
  try {
    const { email } = req.body;

    // 1. Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user found with this email." });
    }

    // 2. Generate reset token (valid for 1 hour)
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const resetLink = `https://frontend-3d-exclusive.vercel.app/reset-password?token=${resetToken}`;

    // 3. Compose email using your branded template
    const resetHtml = generateEmailTemplate({
      firstName: user.firstName,
      subject: "Reset Your Password – Xclusive 3D",
      content: `
        <p style="margin:0;">Hi ${user.firstName},</p>
        <p>We received a request to reset your password for your <strong>Xclusive 3D</strong> account.</p>
        <p>Click the button below to set a new password:</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${resetLink}" style="display: inline-block; padding: 12px 25px; background-color: #ff0066; color: #fff; text-decoration: none; border-radius: 5px; font-size: 16px;">
            Reset My Password
          </a>
        </div>
        <p>This secure link will expire in 1 hour.</p>
        <p>If you didn’t request this, no action is needed — your account is still safe.</p>
        <p>Need help? Just reply to this email and our team will assist you.</p>
        <p style="margin-top:30px;">– The Xclusive 3D Team</p>
      `,
    });

    // 4. Send the email
    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Reset Your Password – Xclusive 3D",
      html: resetHtml,
    });

    // 5. Respond success
    return res.status(200).json({ message: "Password reset link sent to your email." });

  } catch (error) {
    console.error("🚨 resetPasswordRequest error:", error);
    next(error);
  }
};

export const resetPasswordConfirm = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found or token is invalid." });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(400).json({ message: "Reset link has expired." });
    }
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const {
      userId,
      firstName,
      lastName,
      email,
      country,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "Missing userId in request body." });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Dynamically update only provided fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (country) user.country = country;

   
    // Handle image upload if file provided
    if (req.file) {
      if (user.profileUrl && user.profileUrl.includes("cloudinary.com")) {
        const publicId = user.profileUrl.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`user_profiles/${publicId}`);
      }

      const streamUpload = () =>
        new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: 'user_profiles',
              resource_type: 'image',
            },
            (error, result) => {
              if (result) resolve(result);
              else reject(error);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(stream);
        });

      const result = await streamUpload();
      user.profileUrl = result.secure_url;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });

  } catch (error) {
    console.error('Update error:', error);
    next(error);
  }
};





export const handleContactForm = async (req, res, next) => {
  try {
    const { name, email, subject, message, captcha } = req.body;

    // ✅ Validate required fields
    if (!name || !email || !subject || !message || !captcha) {
      return res.status(400).json({ success: false, message: "All fields and CAPTCHA are required." });
    }

    // ✅ Verify reCAPTCHA with Google
    const captchaVerifyUrl = `https://www.google.com/recaptcha/api/siteverify`;
    const captchaRes = await fetch(captchaVerifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET_KEY, // from Google reCAPTCHA admin console
        response: captcha,
      }),
    });
    const captchaData = await captchaRes.json();

    if (!captchaData.success || captchaData.score < 0.5) { // score check applies only for v3
      return res.status(400).json({ success: false, message: "CAPTCHA verification failed." });
    }

    // ✅ Notify Admin
    const adminHtml = generateEmailTemplate({
      firstName: "Admin",
      subject: `New Contact Form Submission`,
      content: `
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    });

    await transporter.sendMail({
      from: `"Xclusive 3D Contact Form" <${process.env.ADMIN_EMAIL}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `📬 New Contact Message from ${name}`,
      html: adminHtml,
    });

    // ✅ Acknowledge User
    const userHtml = generateEmailTemplate({
      firstName: name,
      subject: "We've Received Your Message",
      content: `
        <p>Hi ${name},</p>
        <p>Thanks for reaching out to <strong>Xclusive 3D</strong>. We've received your message and will get back to you as soon as possible.</p>
        <p><strong>Your Message:</strong></p>
        <p>${message}</p>
        <p>In the meantime, feel free to explore our platform!</p>
      `
    });

    await transporter.sendMail({
      from: `"Xclusive 3D Team" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: "✅ We've Received Your Message – Xclusive 3D",
      html: userHtml,
    });

    return res.status(200).json({ success: true, message: "Message sent successfully." });

  } catch (error) {
    console.error("Contact form error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong." });
  }
};



export const toggleNewsletter = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Toggle the preference
    user.newsletterOptIn = !user.newsletterOptIn;
    await user.save();

    const fullName = `${user.firstName} ${user.lastName || ''}`.trim();
    const mailerLiteUrl = 'https://connect.mailerlite.com/api/subscribers';

    try {
      if (user.newsletterOptIn) {
        // Subscribe to MailerLite
        const resMailer = await fetch(mailerLiteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${process.env.MAILER_LITE}`,
          },
          body: JSON.stringify({
            email: user.email,
            name: fullName,
            groups: ['160816159398036489'], // ✅ Replace with your group ID
          }),
        });

        const data = await resMailer.json();
        if (!resMailer.ok) {
          console.error('MailerLite subscription failed:', data);
        } else {
          console.log('Subscribed to MailerLite:', data);
        }
      } else {
        // Unsubscribe from MailerLite
        const resMailer = await fetch(`https://connect.mailerlite.com/api/subscribers/${user.email}`, {
          method: 'DELETE',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${process.env.MAILER_LITE}`,
          },
        });

        if (!resMailer.ok) {
          const error = await resMailer.json();
          console.error('MailerLite unsubscription failed:', error);
        } else {
          console.log('Unsubscribed from MailerLite');
        }
      }
    } catch (mailerError) {
      console.error('MailerLite request error:', mailerError.message);
    }

    res.status(200).json({
      success: true,
      message: `Newsletter ${user.newsletterOptIn ? 'subscribed' : 'unsubscribed'} successfully.`,
      newsletterOptIn: user.newsletterOptIn,
    });
  } catch (error) {
    next(error);
  }
};






export const subscribeNewsletter = async (req, res, next) => {
  try {
    const { email, name = '' } = req.body;

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    // 1. Subscribe to MailerLite
    const response = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.MAILER_LITE}`,
      },
      body: JSON.stringify({
        email,
        name,
        groups: ['160816159398036489'],
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('MailerLite subscription failed:', result);
      return res.status(500).json({ success: false, message: 'Subscription failed. Please try again later.' });
    }

    // 2. Send welcome email
    const unsubscribeUrl = `https://backend-3d-exclusive.vercel.app/api/users/unsubscribe?email=${encodeURIComponent(email)}`;
    const html = generateEmailTemplate({
      firstName: name || 'there',
      subject: "You're subscribed to Xclusive 3D!",
      content: `
        <p>Hi ${name || 'there'},</p>
        <p>Thanks for subscribing to <strong>Xclusive 3D</strong>! We're glad to have you on board.</p>
        <p>Expect the latest updates on 3D content, exclusive deals, and more.</p>
        <p>If you'd ever like to stop receiving emails, just click here:</p>
        <p><a href="${unsubscribeUrl}" style="color:#f97316;">Unsubscribe</a></p>
      `,
    });

    await transporter.sendMail({
      from: `"Xclusive 3D Newsletter" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: "🎉 Welcome to Xclusive 3D",
      html,
    });

    return res.status(200).json({ success: true, message: 'You’ve been successfully subscribed!' });

  } catch (error) {
    console.error('Newsletter subscription error:', error);
    return res.status(500).json({ success: false, message: 'Something went wrong.' });
  }
};



export const unsubscribeNewsletter = async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email || !validator.isEmail(email)) {
      return res.redirect('https://frontend-3d-exclusive.vercel.app/newsletter?unsubscribed=failure');
    }

    const response = await fetch(`https://connect.mailerlite.com/api/subscribers/${email}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${process.env.MAILER_LITE}`,
      },
    });

    if (!response.ok) {
      console.error('Unsubscribe failed:', await response.json());
      return res.redirect('https://frontend-3d-exclusive.vercel.app/newsletter?unsubscribed=failure');
    }

    return res.redirect('https://frontend-3d-exclusive.vercel.app/newsletter?unsubscribed=success');

  } catch (error) {
    console.error('Unsubscribe error:', error);
    return res.redirect('https://frontend-3d-exclusive.vercel.app/newsletter?unsubscribed=failure');
  }
};
