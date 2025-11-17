import Media from "../../models/frontend/media.js";
import streamifier from "streamifier";
import cloudinary from "../../utils/cloudinary.js";

export const uploadMedia = async (req, res) => {
  try {
    let mediaUrl = "";
    let platform = null;

    // ✅ Handle uploaded file (image/video)
    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "website_media",
            resource_type: "auto", // handles both images and videos
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      mediaUrl = uploadResult.secure_url;
    }

    // ✅ Handle external media (YouTube / Vimeo)
    if (req.body.type === "external") {
      mediaUrl = req.body.url;
      platform = req.body.platform?.toLowerCase() || null;
    }

    // ✅ Extract metadata
    const { type, size, dimensions, name, tags } = req.body;

    // ✅ Create new media document
    const newMedia = new Media({
      url: mediaUrl,
      type,
      size,
      dimensions,
      name,
      tags: Array.isArray(tags)
        ? tags
        : typeof tags === "string" && tags.length
        ? tags.split(",").map((t) => t.trim())
        : [],
      platform,
    });

    await newMedia.save();

    return res.status(201).json({
      success: true,
      message: "Media uploaded successfully",
      media: newMedia,
    });
  } catch (error) {
    console.error("Error uploading media:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to upload media",
      error: error.message,
    });
  }
};




export const getAllMedia = async (req, res) => {
  try {
    const mediaItems = await Media.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Media fetched successfully",
      media: mediaItems,
    });
  } catch (error) {
    console.error("Error fetching media:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch media",
      error: error.message,
    });
  }
};
const getCloudinaryPublicId = (url) => {
  if (!url) {
    return null;
  }

  const parts = url.split("/upload/");
  if (parts.length < 2) {
    return null;
  }

  const afterUpload = parts[1]; 
  
  // Remove version number v123455/
  const withoutVersion = afterUpload.replace(/^v[0-9]+\//, "");
  
  // Remove file extension
  const dotIndex = withoutVersion.lastIndexOf(".");
  if (dotIndex === -1) {
    return null;
  }

  const publicId = withoutVersion.substring(0, dotIndex);
  
  return publicId;
};
export const deleteMedia = async (req, res) => {
  try {
  
    const { id } = req.params;

    const mediaItem = await Media.findById(id);
  
    if (!mediaItem) {
      return res.status(404).json({
        success: false,
        message: "Media not found",
      });
    }

    // Extract publicId from the URL
    const publicId = getCloudinaryPublicId(mediaItem.url);
  
    // Delete from Cloudinary
    if (publicId) {
      try {
        const cloudResp = await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error("⛔ Cloudinary delete failed:", err);
      }
    } else {
    }

    // Delete from MongoDB
    await Media.findByIdAndDelete(id);

  
    return res.status(200).json({
      success: true,
      message: "Media deleted successfully",
    });
  } catch (error) {
    console.error("⛔ Error deleting media:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete media",
      error: error.message,
    });
  }
};


export const deleteMultipleMedia = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of media IDs to delete.",
      });
    }

    const mediaItems = await Media.find({ _id: { $in: ids } });

    if (mediaItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No matching media found.",
      });
    }

    const deleteResults = await Promise.all(
      mediaItems.map(async (item) => {
        try {
          const publicId = getCloudinaryPublicId(item.url);
          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
          return { id: item._id, success: true };
        } catch (err) {
          return { id: item._id, success: false, error: err.message };
        }
      })
    );

    await Media.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      success: true,
      message: "Media deleted successfully",
      results: deleteResults,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete media",
      error: error.message,
    });
  }
};



export const updateMedia = async (req, res) => {
  try {
    const { id } = req.params;

    // Input fields
    const {
      url,
      type,
      size,
      dimensions,
      name,
      alt,
      tags,
      platform,
      uploadDate,
    
    } = req.body;

    let updatedFields = {};

    // ---------------------------
    // 1️⃣ FILE REPLACEMENT SUPPORT
    // ---------------------------

    if (req.file) {
      const bufferStream = streamifier.createReadStream(req.file.buffer);

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "website_media",
            resource_type: "auto",
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        bufferStream.pipe(stream);
      });

      updatedFields.url = uploadResult.secure_url;
      updatedFields.type = uploadResult.resource_type === "video" ? "video" : "image";
      updatedFields.size = `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`;
      updatedFields.dimensions = uploadResult.width && uploadResult.height 
        ? `${uploadResult.width}x${uploadResult.height}` 
        : null;
      updatedFields.name = req.file.originalname;
    }

    // ---------------------------
    // 2️⃣ EXTERNAL MEDIA (YouTube/Vimeo)
    // ---------------------------

    if (type === "external") {
      updatedFields.url = url;
      updatedFields.type = "external";
      updatedFields.platform = platform?.toLowerCase() || null;
    }

    // ---------------------------
    // 3️⃣ UPDATE NORMAL FIELDS
    // ---------------------------

    if (!req.file && type && type !== "external") updatedFields.type = type;
    if (size) updatedFields.size = size;
    if (dimensions) updatedFields.dimensions = dimensions;
    if (name) updatedFields.name = name;
    if (alt) updatedFields.alt = alt;
    if (uploadDate) updatedFields.uploadDate = uploadDate;

    // Tags
    if (tags) {
      updatedFields.tags = Array.isArray(tags)
        ? tags
        : tags.split(",").map((t) => t.trim());
    }

// ---------------------------
// 4️⃣ TRANSFORMATION SETTINGS (UPDATED FOR NEW editImage FIELDS)
// ---------------------------

let transformations = {};

if (req.body.transformations) {
  try {
    transformations = JSON.parse(req.body.transformations);
  } catch (err) {
    transformations = req.body.transformations;
  }
}

updatedFields.transformations = {
  cropWidth: transformations.cropWidth ?? null,
  cropHeight: transformations.cropHeight ?? null,
  aspectRatio: transformations.aspectRatio ?? "free",

  resizeWidth: transformations.resizeWidth ?? null,
  resizeHeight: transformations.resizeHeight ?? null,
  keepAspect: transformations.keepAspect ?? true,

  rotate: transformations.rotate ?? 0,

  filter: transformations.filter ?? "",
  filterIntensity: transformations.filterIntensity ?? 100,

  quality: transformations.quality ?? "original",
  format: transformations.format ?? "original",
};


    // ---------------------------
    // 5️⃣ UPDATE DOCUMENT
    // ---------------------------

    const updatedMedia = await Media.findByIdAndUpdate(id, updatedFields, {
      new: true,
    });

    if (!updatedMedia) {
      return res.status(404).json({
        success: false,
        message: "Media not found",
      });
    }

    return res.json({
      success: true,
      message: "Media updated successfully",
      media: updatedMedia,
    });

  } catch (error) {
    console.error("Error updating media:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update media",
      error: error.message,
    });
  }
};


export const getMediaStats = async (req, res) => {
  try {
    const allMedia = await Media.find();

    const totalFiles = allMedia.length;
    const images = allMedia.filter((m) => m.type === "image").length;
    const videos = allMedia.filter((m) => m.type === "video").length;

    // ✅ Calculate total storage used (in MB)
    // If you store `size` like "2.5 MB" or "500 KB", we’ll try to parse that safely.
    const totalSizeMB = allMedia.reduce((acc, item) => {
      if (!item.size) return acc;

      const sizeStr = item.size.toString().trim().toUpperCase();
      const num = parseFloat(sizeStr);

      if (isNaN(num)) return acc;

      if (sizeStr.endsWith("KB")) return acc + num / 1024;
      if (sizeStr.endsWith("MB")) return acc + num;
      if (sizeStr.endsWith("GB")) return acc + num * 1024;
      return acc; // unknown format, ignore
    }, 0);

    return res.status(200).json({
      success: true,
      message: "Media stats fetched successfully",
      stats: {
        totalFiles,
        images,
        videos,
        storageUsed: `${totalSizeMB.toFixed(1)} MB`,
      },
    });
  } catch (error) {
    console.error("Error fetching media stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch media stats",
      error: error.message,
    });
  }
};
