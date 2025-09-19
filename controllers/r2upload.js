
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { User } from '../models/user.js';
import { Video } from '../models/b2Upload.js';
import { transporter } from '../utils/mailer.js';
import generateEmailTemplate from '../utils/emailTemplate.js';
import { Wallet } from '../models/wallet.js';
import { pusher } from '../utils/pusher.js';
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
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const getObjectCommand = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(r2Client, getObjectCommand, { expiresIn: 60 * 60 * 24 * 7 });

      const savedVideo = await Video.create({
      user: user._id,
      originalFileName,
      b2Url: signedUrl,
      fileSize,
      lengthInSeconds,
      conversionFormat,
      quality,
      creditsUsed,
      progress: 0, 
    });

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
      from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: '✅ Your Video is Uploaded – Xclusive 3D',
      html: emailHtml,
    });

    console.log(`📩 Email sent to ${user.email} for video: ${originalFileName}`);

    return res.status(200).json({
      success: true,
      videoId: savedVideo._id,
      videoUrl: signedUrl,
    });
  } catch (err) {
    console.error('❌ Metadata error:', err);
    res.status(500).json({ error: 'Metadata save failed' });
  }
};



export const updateVideoStatusOrCompletion = async (req, res) => {
  console.log(req.body);
  try {
    const { videoId, plainUrl, status, progress } = req.body;
    
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

   // Update status or progress (e.g. "processing", "65%")
if (status && (!plainUrl || status !== "completed")) {
  video.status = status;
  if (progress !== undefined) {
    video.progress = progress;
  }
  await video.save();

  // 🔔 Trigger real-time status/progress update
  await pusher.trigger(`exclusive`, "status-update", {
    videoId,
    status,
    progress: video.progress,
  });

  return res.status(200).json({
    success: true,
    message: `Video status updated to "${status}"`,
    progress: video.progress,
  });
}

    if (status === "completed" && plainUrl) {
      const urlObj = new URL(plainUrl);
      let key = decodeURIComponent(urlObj.pathname.replace(/^\/+/, ""));
      key = key.replace(/^3d-uploads\//, "");

      const getObjectCommand = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        ResponseContentDisposition: 'attachment',
      });

      const signedUrl = await getSignedUrl(r2Client, getObjectCommand, {
        expiresIn: 60 * 60 * 24 * 7,
      });

      video.status = "completed";
      video.convertedUrl = signedUrl;
      video.progress = 100;
      await video.save();

      const user = video.user;

      const emailHtml = generateEmailTemplate({
        firstName: user.firstName || "there",
        subject: "🚀 Your Video is Ready!",
        content: `
          <p style="color:#fff;">Hi ${user.firstName},</p>
          <p style="color:#fff;">Your video <strong>${video.originalFileName}</strong> has been successfully converted to 3D.</p>
          <p style="color:#fff;">You can <a href="${signedUrl}" style="color:#ff8c2f;">click here</a> to download it.</p>
        `,
      });

      await transporter.sendMail({
        from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
        to: user.email,
        subject: "✅ Your 3D Video is Ready – Xclusive 3D",
        html: emailHtml,
      });

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
      createdAt: v.createdAt,
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
