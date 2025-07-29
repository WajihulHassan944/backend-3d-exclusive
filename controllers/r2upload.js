
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
    const { originalFileName, key, quality, lengthInSeconds , conversionFormat } = req.body;

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
      lengthInSeconds,
      conversionFormat,
      quality,
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
  console.log("📥 Incoming request body:", req.body);
  try {
    const { videoId, plainUrl, status } = req.body;
    
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

    // Update only status (e.g. "processing")
    if (status && (!plainUrl || status !== "completed")) {
      video.status = status;
      await video.save();

      // 🔔 Trigger status update via Pusher
      await pusher.trigger(`exclusive`, "status-update", {
       videoId, // required for matching
      status
      });

      return res.status(200).json({
        success: true,
        message: `Video status updated to "${status}"`,
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
