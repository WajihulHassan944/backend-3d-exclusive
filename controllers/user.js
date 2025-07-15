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

// For new user signup
export const googleRegister = async (req, res, next) => {
  const { token } = req.body;

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
      profileUrl: picture,
      verified: true,
      isNotificationsEnabled: true,
      isSubscribed: true,
      isAgreed: true,
    });

  // ✅ Initialize Stripe Customer and Wallet
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



    // ✅ Generate welcome email using reusable template
    const welcomeHtml = generateEmailTemplate({
      firstName: user.firstName,
      subject: 'Welcome to doTask!',
      content: `
        <h2 style="color:#007bff;">Welcome ${user.firstName}!</h2>
        <p>Thanks for signing up using Google. Start exploring our services today and discover how easy it is to connect with top-rated professionals.</p>
      `
    });

    // Send welcome email to user
    await transporter.sendMail({
      from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: "Welcome to Service Marketplace!",
      html: welcomeHtml,
    });

    // Notify admin of new signup
   const adminNotificationHtml = generateEmailTemplate({
  firstName: "Admin",
  subject: "New Google Signup Notification",
  content: `
    <p>A new user signed up via Google:</p>
    <ul>
      <li><strong>Name:</strong> ${user.firstName} ${user.lastName}</li>
      <li><strong>Email:</strong> ${user.email}</li>
    </ul>
  `
});

await transporter.sendMail({
  from: `"Service Marketplace Admin" <${process.env.ADMIN_EMAIL}>`,
  to: process.env.ADMIN_EMAIL,
  subject: "New Google Signup Notification",
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

    if (!user.verified || user.blocked) {
      return next(new ErrorHandler("Account is either not verified or has been blocked.", 403));
    }

    // Clean roles: remove duplicates and conditionally include "seller"
    let cleanedRoles = Array.from(new Set(user.role || []));

    if (!user.sellerStatus) {
      cleanedRoles = cleanedRoles.filter(role => role !== "seller");
    }

    // Determine top role (if available)
    const priority = { seller: 1, buyer: 2 };
    const sortedRoles = [...cleanedRoles].sort((a, b) => priority[a] - priority[b]);
    const topRole = sortedRoles[0] || "buyer";

    sendCookie(user, res, `Welcome back, ${user.firstName}`, 200, {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        profileUrl: user.profileUrl || picture,
        email: user.email,
        country: user.country,
        role: cleanedRoles,
        verified: user.verified,
        blocked: user.blocked,
        createdAt: user.createdAt,
        sellerStatus: user.sellerStatus,
      },
      topRole,
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
    if (!user) return next(new ErrorHandler("User not found", 404));

    // Delete the profile image from Cloudinary (if exists)
    if (user.profileUrl) {
      const segments = user.profileUrl.split('/');
      const publicIdWithExtension = segments[segments.length - 1]; // tieanrvu1hh8hmtkfeff.jpg
      const publicId = publicIdWithExtension.split('.')[0]; // tieanrvu1hh8hmtkfeff

      await cloudinary.uploader.destroy(`user_profiles/${publicId}`);
    }

    // Delete the user from MongoDB
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.firstName} ${user.lastName} and associated data deleted successfully.`,
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
    }

    const newUserData = {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      country,
      profileUrl,
    };

   
    const user = await User.create(newUserData);

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
  const verificationLink = `https://backend-3dexclusive.vercel.app/api/users/verify-email?token=${token}`;
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
      return res.redirect("https://3-d-exlusive.vercel.app/status?verified=already");
    }

    user.verified = true;
    await user.save();

    res.redirect("https://3-d-exlusive.vercel.app/status?verified=success");
  } catch (error) {
    console.error(error);
    res.redirect("https://3-d-exlusive.vercel.app/status?verified=fail");
  }
};


export const getMyProfile = async (req, res, next) => {
  try {
    const user = req.user;
    const userId = user._id;
    const wallet = await Wallet.findOne({ userId });


    res.status(200).json({
      success: true,
      user: user,
      wallet: wallet,
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

