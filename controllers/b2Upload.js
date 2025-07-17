import AWS from 'aws-sdk';
import formidable from 'formidable';
import fs from 'fs';
import { User } from '../models/user.js';
import { Video } from '../models/b2Upload.js';
import { transporter } from '../utils/mailer.js';
import generateEmailTemplate from '../utils/emailTemplate.js';

const s3 = new AWS.S3({
  accessKeyId: process.env.B2_ACCESS_KEY_ID,
  secretAccessKey: process.env.B2_SECRET_ACCESS_KEY,
  endpoint: process.env.B2_ENDPOINT,
  region: process.env.B2_REGION,
  signatureVersion: 'v4',
});
export const uploadToB2 = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const filePath = file.path;

    const fileStream = fs.createReadStream(filePath);
    const uniqueFileName = `uploads/${Date.now()}_${file.originalname}`;

    const uploadParams = {
      Bucket: process.env.B2_BUCKET_NAME,
      Key: uniqueFileName,
      Body: fileStream,
      ContentType: file.mimetype,
    };

    const result = await s3.upload(uploadParams).promise();
   const signedUrl = s3.getSignedUrl('getObject', {
  Bucket: process.env.B2_BUCKET_NAME,
  Key: uploadParams.Key,
   Expires:60 * 60 * 24 * 7,
});

const videoUrl = signedUrl;

    const savedVideo = await Video.create({
      user: user._id,
      originalFileName: file.originalname,
      b2Url: videoUrl,
    });

    const emailHtml = generateEmailTemplate({
      firstName: user.firstName || "there",
      subject: '🎉 Your Video Upload was Successful!',
      content: `
        <p style="color:#fff;">Hi ${user.firstName},</p>
        <p style="color:#fff;">Your video <strong>${file.originalname}</strong> has been successfully uploaded.</p>
        <p style="color:#fff;">We'll begin converting it to 3D shortly. You will receive another email once it's done.</p>
        <p style="color:#fff;">You can download/view the original file here:</p>
        <a href="${videoUrl}" style="color: #FF5722;">${videoUrl}</a>
      `,
    });

    await transporter.sendMail({
      from: `"Xclusive 3D" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: '✅ Your Video is Uploaded – Xclusive 3D',
      html: emailHtml,
    });
console.log(`📩 Email sent to ${user.email} for video: ${file.originalname}`);

    return res.status(200).json({
      success: true,
      videoId: savedVideo._id,
      videoUrl,
    });
  } catch (error) {
    console.error("❌ Upload error:", error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};
export const getAllUploads = async (req, res) => {
  try {
    const videos = await Video.find();

    return res.status(200).json({
      success: true,
      count: videos.length,
      videos,
    });
  } catch (error) {
    console.error("❌ Error fetching uploads:", error);
    return res.status(500).json({ error: 'Failed to fetch uploads' });
  }
};
export const deleteUpload = async (req, res) => {
  try {
    const videoId = req.params.id;

    const video = await Video.findOne({ _id: videoId });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const fullUrl = video.b2Url;
    const url = new URL(fullUrl);
    const key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

    console.log('🗝️ Deleting key from B2:', key);

    const deleteResult = await s3.deleteObject({
      Bucket: process.env.B2_BUCKET_NAME,
      Key: key,
    }).promise();

    console.log('🧹 S3 delete response:', deleteResult); // Usually empty if success

    await Video.deleteOne({ _id: videoId });

    return res.status(200).json({ success: true, message: 'Video deleted successfully' });
  } catch (error) {
    console.error("❌ Delete error:", error);
    return res.status(500).json({ error: 'Failed to delete video' });
  }
};
