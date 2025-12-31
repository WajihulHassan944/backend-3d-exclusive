
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { User } from '../models/user.js';
import { Video } from '../models/b2Upload.js';
import { transporter } from '../utils/mailer.js';
import generateEmailTemplate from '../utils/emailTemplate.js';
import { Wallet } from '../models/wallet.js';
import { pusher } from '../utils/pusher.js';
import { Invoice } from '../models/invoice.js';
import Coupon from '../models/coupon.js';
const r2Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true, 
  region: 'us-east-1', 
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const getR2SignedUrl = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { fileName, fileType, usingFreeConversion, cost } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'Missing fileName or fileType' });
    }

    // 🔓 Mark free conversion as used
    if (usingFreeConversion && user.hasFreeConversion) {
      user.hasFreeConversion = false;
      await user.save();
      console.log(`🎁 Used free conversion for user ${user.email}`);
    }

    // 💰 Deduct credits if not using free conversion
    if (!usingFreeConversion) {
      const wallet = await Wallet.findOne({ userId: user._id });
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' });
      }

      if (wallet.balance < cost) {
        return res.status(400).json({ error: `Insufficient credits. Required: ${cost}, Available: ${wallet.balance}` });
      }

      // Deduct and record transaction
      wallet.balance -= cost;
      await wallet.save();
      console.log(`💳 Charged ${cost} credits from ${user.email}`);
    }

    // ✅ Generate signed URL
    const key = `uploads/${Date.now()}_${fileName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 600 });

    return res.status(200).json({ signedUrl, key });
  } catch (err) {
    console.error('❌ Signed URL Error:', err);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
};

export const saveR2Metadata = async (req, res) => {
  try {
    const {
      originalFileName,
      key,
      quality,
      lengthInSeconds,
      conversionFormat,
      fileSize,
      creditsUsed,
      threeDExperience,
      clientInfo
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // ✅ Generate signed URL from R2
    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(r2Client, getObjectCommand, {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
    });

    // ✅ Format experience text
    const formattedExperience =
      threeDExperience?.charAt(0).toUpperCase() +
      threeDExperience?.slice(1).toLowerCase();

// ✅ Estimate processing time dynamically based on resolution
// Assume average video FPS = 30
let renderFPS;

// Extract numeric resolution value, e.g. "1080p" → 1080
const resolution = parseInt(quality.replace(/\D/g, ''), 10);

// Set FPS dynamically based on resolution range
if (resolution <= 480) renderFPS = 18;
else if (resolution <= 720) renderFPS = 14;
else if (resolution <= 1080) renderFPS = 10;
else if (resolution <= 2160) renderFPS = 4;
else if (resolution <= 4320) renderFPS = 2;
else renderFPS = 1;

const totalFrames = lengthInSeconds * 30; // assuming 30fps input

const STARTUP_TIME_MINUTES = 4; // ⏱ fixed startup time requested by client

const estimatedProcessingTime =
  STARTUP_TIME_MINUTES +
  (((totalFrames / renderFPS) * 1.15) / 60); // in minutes

    // ✅ Save video metadata
    const savedVideo = await Video.create({
      user: user._id,
      originalFileName,
      b2Url: signedUrl,
      fileSize,
      lengthInSeconds,
      conversionFormat,
      quality,
      creditsUsed,
      threeDExperience: formattedExperience,
      progress: 0,
      estimatedProcessingTime, // ✅ stored in backend
      clientInfo: clientInfo || null,
      fps: renderFPS,
    });

    // ✅ Send confirmation email
    const emailHtml = generateEmailTemplate({
      firstName: user.firstName || 'there',
      subject: '🎉 Your Video Upload was Successful!',
      content: `
        <p style="color:#fff;">Hi ${user.firstName},</p>
        <p style="color:#fff;">Your video <strong>${originalFileName}</strong> has been successfully uploaded.</p>
        <p style="color:#fff;">We'll begin converting it to 3D shortly. You will receive another email once it's done.</p>
      `,
    });

    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.FROM}>`,
      to: user.email,
      subject: '✅ Your Video is Uploaded – Xclusive 3D',
      html: emailHtml,
    });

    console.log(`📩 Email sent to ${user.email} for video: ${originalFileName}`);

    return res.status(200).json({
      success: true,
      videoId: savedVideo._id,
      videoUrl: signedUrl,
      estimatedProcessingTime, // optional: return for frontend display
    });
  } catch (err) {
    console.error('❌ Metadata error:', err);
    res.status(500).json({ error: 'Metadata save failed' });
  }
};

export const getVideoQualities = async (req, res) => {
  try {
    const qualities = await Video.distinct('quality'); // only unique values

    if (!qualities || qualities.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No video qualities found',
      });
    }

    return res.status(200).json({
      success: true,
      qualities,
    });
  } catch (error) {
    console.error('❌ Error fetching video qualities:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching video qualities',
    });
  }
};

export const updateVideoStatusOrCompletion = async (req, res) => {
 
  try {
const { videoId, plainUrl, status, progress, errorMessage, creditsUsed, quality } = req.body;
    
 if (status === "completed" && !plainUrl) {
    return res.status(400).json({
      error: "Missing plainUrl for completed status",
    });
  }

    if (!videoId) {
      return res.status(400).json({ error: "Missing videoId" });
    }

    const video = await Video.findById(videoId).populate("user");
    if (!video) return res.status(404).json({ error: "Video not found" });
const bucketName = video.freeTrial
  ? process.env.R2_FREE_TRIAL_BUCKET_NAME
  : process.env.R2_BUCKET_NAME;


    // Update status or progress (e.g. "processing", "65%")
if (status && (!plainUrl || status !== "completed")) {
  if (status === "processing" && !video.startedAt) {
    video.startedAt = new Date(); // only set once
  }
  video.status = status;
  
  if (progress !== undefined) {
    video.progress = progress;
  }
  if (errorMessage) {
    video.errorMessage = errorMessage;
  }
  if (creditsUsed !== undefined) {
    video.creditsUsed = creditsUsed;
  }
  if (quality) {
    video.quality = quality;
  }

  await video.save();

  // 🔔 Trigger real-time status/progress update
  await pusher.trigger(`exclusive`, "status-update", {
    videoId,
    status,
    progress: video.progress,
    errorMessage: video.errorMessage,
    creditsUsed: video.creditsUsed,
    quality: video.quality,
    startedAt: video.startedAt,
  });

  return res.status(200).json({
    success: true,
    message: `Video status updated to "${status}"`,
    progress: video.progress,
    errorMessage: video.errorMessage,
    creditsUsed: video.creditsUsed,
    quality: video.quality,
  });
}


    if (status === "completed" && plainUrl) {
      const urlObj = new URL(plainUrl);

// Strip only the bucket root from the start of the key
const bucketPrefix = video.freeTrial ? "3d-upload-free-trial/" : "3d-uploads/";
let key = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ""));
if (key.startsWith(bucketPrefix)) key = key.slice(bucketPrefix.length);




      const getObjectCommand = new GetObjectCommand({
      Bucket: bucketName,
        Key: key,
        ResponseContentDisposition: 'attachment',
      });

      const signedUrl = await getSignedUrl(r2Client, getObjectCommand, {
        expiresIn: 60 * 60 * 24 * 7,
      });

      video.status = "completed";
      video.convertedUrl = signedUrl;
      video.progress = 100;
       video.completedAt = new Date();
      await video.save();

    const user = video.user;
if (video.freeTrial) {
  try {

// ⏳ Force-reset expiry to 48 hours from NOW on completion
await Coupon.updateMany(
  {
    status: "active",
    "usageRestriction.userEmail": user.email.toLowerCase(),
  },
  {
    $set: {
      expiryDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  }
);

    // 🔎 Find active, non-expired coupon restricted to this email
    const coupon = await Coupon.findOne({
      status: "active",
      "usageRestriction.userEmail": user.email.toLowerCase(),
      expiryDate: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    const couponCode = coupon?.code || "TRIAL40";

    // ✅ Prepare CountdownMail dynamic timer URL using coupon expiry
    let countdownUrl = "https://i.countdownmail.com/4qmxrp.gif"; // Replace with your timer ID
    if (coupon?.expiryDate) {
      // Format expiry date in ISO with timezone offset
      const expiryISO = new Date(coupon.expiryDate).toISOString();
      countdownUrl += `?end_date_time=${expiryISO}`;
    }

    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.FROM}>`,
      to: user.email,
      subject: "🎁 Your 10-sec 3D Preview + Exclusive 40% Discount",
      html: generateEmailTemplate({
        firstName: user.firstName || "there",
        subject: "Your Free 3D Preview Is Ready",
        content: `
          <p>Hi there,</p>

          <p>Your free <strong>10-second 3D preview</strong> is ready. We hope you are impressed with the result!</p>

          <p>
            👉 <a href="${signedUrl}" style="color:#ff8c2f;font-weight:bold;">
              Download your 10-sec preview here
            </a>
          </p>

          <p><strong>But... the story isn't finished yet.</strong></p>

          <p>
            Those 10 seconds are just a teaser. Don't stop halfway.
            Your video deserves to be experienced fully in this stunning quality.
          </p>

          <p>
            As a reward for trying our preview, we're offering you an
            <strong>exclusive 40% discount</strong>.
          </p>

          <p style="font-size:18px;font-weight:bold;margin:16px 0;">
            Coupon Code: ${couponCode}
          </p>

          <p><strong>⏳ This offer expires permanently on ${new Date(coupon.expiryDate).toLocaleString()}.</strong></p>

          <div style="text-align:center; margin:24px 0;">
            <img src="${countdownUrl}" style="width:100%!important;" border="0" alt="Countdown Timer"/>
          </div>

          <p><strong>Upgrade today and secure:</strong></p>
          <ul>
            <li>✅ Full-length 3D conversion</li>
            <li>✅ Maximum depth & clarity (VR-ready)</li>
            <li>✅ Priority processing</li>
            <li>✅ 40% instant discount</li>
          </ul>

          <div style="margin:30px 0;text-align:center;">
            <a href="https://www.xclusive3d.com/pricing?coupon=${couponCode}"
               style="padding:14px 26px;background:#ff8c2f;color:#fff;
               border-radius:6px;text-decoration:none;font-weight:bold;">
              REDEEM 40% DISCOUNT
            </a>
          </div>

          <p>
            Don't wait until the timer hits zero.
            Once time runs out, the discount is gone.
          </p>

          <p>
            Best regards,<br/>
            <strong>The Xclusive 3D Team</strong>
          </p>
        `,
      }),
    });
  } catch (mailErr) {
    console.error("❌ Free trial email failed:", mailErr);
  }
}

 else {
  // 🚀 Normal completion email
  const emailHtml = generateEmailTemplate({
    firstName: user.firstName || "there",
    subject: "🚀 Your Video is Ready!",
    content: `
      <p>Your video <strong>${video.originalFileName}</strong> has been successfully converted to 3D.</p>
      <p>You can <a href="${signedUrl}" style="color:#ff8c2f;">click here</a> to download it.</p>
    `,
  });

  await transporter.sendMail({
    from: `"Xclusive 3D" <${process.env.FROM}>`,
    to: user.email,
    subject: "✅ Your 3D Video is Ready – Xclusive 3D",
    html: emailHtml,
  });
}


      console.log(`📩 Completion email sent to ${user.email} for video ${video.originalFileName}`);

      // 🔔 Trigger real-time "completed" update
      await pusher.trigger(`exclusive`, "status-update", {
       videoId,
        status: "completed",
        signedUrl,
      });

      return res.status(200).json({
        success: true,
        message: "Video marked as completed and user notified",
        signedUrl,
      });
    }

    return res.status(400).json({ error: "Invalid request: missing or mismatched fields" });
  } catch (err) {
    console.error("❌ Error updating video:", err);
    return res.status(500).json({ error: "Server error while updating video" });
  }
};



export const getConversionQueue = async (req, res) => {
  try {
    const videos = await Video.find()
      .populate("user", "firstName lastName email")
      .sort({ createdAt: -1 });

const formatted = videos.map((v) => ({
  id: v._id,
  status: v.status,
  customer: `${v.user?.firstName || ""} ${v.user?.lastName || ""}`.trim(),
  email: v.user?.email || "",
  fileName: v.originalFileName,
  fileSize: v.fileSize || "-",
  type: v.conversionFormat || "-",

  // ✅ NEW → File type (extension only)
  fileType: v.originalFileName?.split(".").pop() || "",

  // ✅ NEW → Resolution from quality field (e.g. "1080p")
  resolution: v.quality || "-",

  // ✅ NEW → fps
  fps: v.fps || null,

  progress:
    v.status === "completed"
      ? "100%"
      : v.status === "failed"
      ? "Failed"
      : `${v.progress || 0}%`,
  credits: v.creditsUsed || 0,
  duration: v.lengthInSeconds
    ? `${Math.floor(v.lengthInSeconds / 60)}m ${v.lengthInSeconds % 60}s`
    : "-",
  errorMessage: v.errorMessage || "",
  conversionUrl: v.b2Url || "",
  convertedUrl: v.convertedUrl || "",

  // ✅ NEW → completedAt (formatted)
  completedAt: v.completedAt
    ? v.completedAt.toISOString().slice(0, 16).replace("T", " ")
    : null,

  // ⏰ NEW → createdAt formatted (YYYY-MM-DD HH:mm)
  createdAt: v.createdAt
    ? v.createdAt.toISOString().slice(0, 16).replace("T", " ")
    : null,

  clientInfo: v.clientInfo || null,
  creditsRefunded: v.creditsRefunded,
}));

    res.json({ success: true, queue: formatted });
  } catch (err) {
    console.error("Error fetching conversion queue:", err);
    res.status(500).json({ success: false, message: "Failed to fetch conversion queue" });
  }
};




export const getConversionStats = async (req, res) => {
  try {
    // Count all conversions
    const totalConversions = await Video.countDocuments();

    // Count per status
    const completed = await Video.countDocuments({ status: "completed" });
    const processing = await Video.countDocuments({ status: "processing" });
    const queued = await Video.countDocuments({ status: { $in: ["queued", "pending", "uploaded"] } });
    const errors = await Video.countDocuments({ status: "failed" });

    // Success rate (avoid division by 0)
    const successRate =
      totalConversions > 0
        ? ((completed / totalConversions) * 100).toFixed(1)
        : 0;

    const stats = {
      totalConversions,
      completed,
      processing,
      queued,
      errors,
      successRate: `${successRate}%`,
    };

    return res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("❌ Error fetching conversion stats:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversion stats",
    });
  }
};


export const getConversionDashboard = async (req, res) => {
  try {
    // 1️⃣ Conversion Stats
    const totalConversions = await Video.countDocuments();
    const completed = await Video.countDocuments({ status: "completed" });
    const processing = await Video.countDocuments({ status: "processing" });
    const queued = await Video.countDocuments({ status: { $in: ["queued", "pending", "uploaded"] } });
    const failed = await Video.countDocuments({ status: "failed" });

    const successRate =
      totalConversions > 0
        ? ((completed / totalConversions) * 100).toFixed(1)
        : 0;

    const stats = {
      inProgress: processing,
      queued,
      completed,
      failed,
      completionRate: `${successRate}%`,
    };

    // 2️⃣ Recent Orders (latest 10 invoices)
    const invoices = await Invoice.find({})
      .populate("user") // get customer info
      .sort({ createdAt: -1 })
      .limit(10);

    const recentOrders = invoices.map((inv, idx) => {
      const customerName = `${inv.user?.firstName || ""} ${inv.user?.lastName || ""}`.trim();

      // Order ID (ORD-001 style)
      const orderId = `ORD-${String(idx + 1).padStart(3, "0")}`;

      // total credits in this order
      const totalCredits =
        inv.credits?.reduce((sum, c) => sum + (c.credits || 0), 0) || 0;

      // Date/time handling
     // Date/time handling
const issuedAt = inv.issuedAt || inv.createdAt;
let timeAgo = "-";

if (issuedAt) {
  const diffMs = Date.now() - new Date(issuedAt).getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) {
    timeAgo = `${diffMins} min ago`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    timeAgo = `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else if (diffMins < 43200) { // < 30 days
    const days = Math.floor(diffMins / 1440);
    timeAgo = `${days} day${days > 1 ? "s" : ""} ago`;
  } else if (diffMins < 525600) { // < 12 months
    const months = Math.floor(diffMins / 43200);
    timeAgo = `${months} month${months > 1 ? "s" : ""} ago`;
  } else {
    const years = Math.floor(diffMins / 525600);
    timeAgo = `${years} year${years > 1 ? "s" : ""} ago`;
  }
}


      return {
        _id: inv._id,
        orderId,
        customer: customerName,
        email: inv.user?.email || "",
        company: inv.billingInfo?.companyName || "",
        vatNumber: inv.billingInfo?.vatNumber || "",
        street: inv.billingInfo?.street || "",
        postalCode: inv.billingInfo?.postalCode || "",
        city: inv.billingInfo?.city || "",
        country: inv.billingInfo?.countryName || "",
        amount: inv.total ? inv.total.toFixed(2) : "0.00",
        currency: inv.currency || "€",
        credits: totalCredits,
        status: inv.status || "Completed",
        method: inv.method || "Manual order",
        notes: inv.notes || "",
        timeAgo,
      };
    }).reverse();

    // 3️⃣ Final response
    return res.status(200).json({
      success: true,
      dashboard: {
        stats,
        recentOrders,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching conversion dashboard:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch conversion dashboard",
    });
  }
};



export const resendVideoNotification = async (req, res) => {
  try {
    const { videoId } = req.body;

    if (!videoId) {
      return res.status(400).json({ error: "Missing videoId" });
    }

    const video = await Video.findById(videoId).populate("user");
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    if (video.status !== "completed" || !video.convertedUrl) {
      return res.status(400).json({
        error: "Video is not completed yet or converted URL missing",
      });
    }

    const user = video.user;

    // Build email template
    const emailHtml = generateEmailTemplate({
      firstName: user.firstName || "there",
      subject: "🚀 Your Video is Ready!",
      content: `
        <p style="color:#fff;">Hi ${user.firstName},</p>
        <p style="color:#fff;">Your video <strong>${video.originalFileName}</strong> has been successfully converted to 3D.</p>
        <p style="color:#fff;">You can <a href="${video.convertedUrl}" style="color:#ff8c2f;">click here</a> to download it.</p>
      `,
    });

    // Send email again
    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.FROM}>`,
      to: user.email,
      subject: "✅ Your 3D Video is Ready – Xclusive 3D",
      html: emailHtml,
    });

    console.log(`📩 Resend email sent to ${user.email} for video ${video.originalFileName}`);

    // Trigger pusher again
    await pusher.trigger(`exclusive`, "status-update", {
      videoId,
      status: "completed",
      signedUrl: video.convertedUrl,
    });

    return res.status(200).json({
      success: true,
      message: `Notification re-sent to ${user.email}`,
      signedUrl: video.convertedUrl,
    });
  } catch (err) {
    console.error("❌ Error resending video notification:", err);
    return res.status(500).json({ error: "Server error while resending notification" });
  }
};




export const freeTrialUploadAndSignedUrl = async (req, res) => {
  try {
    const {
      email,
      fileName,
      fileType,
      lengthInSeconds,
      fileSize,
      conversionFormat,
      quality,
      threeDExperience,
      clientInfo,
       startTime,
  endTime,
  trimOnly,
    } = req.body;

    if (!email || !fileName || !fileType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

if (trimOnly) {
  if (
    typeof startTime !== "number" ||
    typeof endTime !== "number" ||
    endTime <= startTime
  ) {
    return res.status(400).json({ error: "Invalid trim range" });
  }

  if (endTime - startTime > 10) {
    return res.status(400).json({
      error: "Free trial is limited to 10 seconds only",
    });
  }
}

    // 🔍 Find or create user
    let user = await User.findOne({ email });

    if (!user) {
   
      user = await User.create({
        firstName:'Free trial user',
        email,
        verified: false,
        hasFreeConversion: false,
        newsletterOptIn: true,
        signedUp: false,
      });
    }

    // ❌ Block second free trial
    const alreadyUsed = await Video.findOne({
      user: user._id,
      freeTrial: true,
    });

    // if (alreadyUsed) {
    //   return res.status(403).json({
    //     error: "Free trial already used",
    //   });
    // }

    // 📂 Cloudflare R2 → free-trial folder
    const key = `3d_upload_free_trial/${Date.now()}_${fileName}`;



    const putCommand = new PutObjectCommand({
      Bucket: process.env.R2_FREE_TRIAL_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const uploadSignedUrl = await getSignedUrl(r2Client, putCommand, {
      expiresIn: 600,
    });

    // 🔗 Read URL (7 days)
    const getCommand = new GetObjectCommand({
      Bucket: process.env.R2_FREE_TRIAL_BUCKET_NAME,
      Key: key,
    });

    const b2Url = await getSignedUrl(r2Client, getCommand, {
      expiresIn: 60 * 60 * 24 * 7,
    });

    // 🎞 Save video metadata
    const video = await Video.create({
      user: user._id,
      originalFileName: fileName,
      fileSize,
      b2Url,
      lengthInSeconds,
      conversionFormat,
      quality,
      threeDExperience: threeDExperience || "Comfort",
      freeTrial: true,
      creditsUsed: 0,
      status: "uploaded",
      startTime,
endTime,
trimOnly: !!trimOnly,
      clientInfo: {
        ...clientInfo,
        freeTrialEmail: email,
      },
    });

const discountCode = `TRIAL40-${Math.random()
  .toString(36)
  .slice(2, 8)
  .toUpperCase()}`;

// ⏳ 48 hours expiry
const expiryDate = new Date();
expiryDate.setHours(expiryDate.getHours() + 48);
// 💾 Save coupon in DB (email-restricted, single use)
await Coupon.create({
  code: discountCode,
  type: "percentage",
  amount: 40,
  description: "40% off – Free trial exclusive",
  usageLimit: 1,
  expiryDate,
  allowCombine: false,
  usageRestriction: {
    individualUseOnly: true,
    userEmail: email.toLowerCase(),
  },
});
     
    // 📬 MailerLite (free trial group)
    try {
      await fetch("https://connect.mailerlite.com/api/subscribers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${process.env.MAILER_LITE}`,
        },
        body: JSON.stringify({
          email,
          groups: ['160816159398036489'],
        }),
      });
    } catch (err) {
      console.error("MailerLite error:", err.message);
    }

    return res.status(200).json({
      success: true,
      signedUrl: uploadSignedUrl,
      key,
      videoId: video._id,
      discountCode,
    });
  } catch (err) {
    console.error("❌ Free trial error:", err);
    res.status(500).json({ error: "Free trial upload failed" });
  }
};
