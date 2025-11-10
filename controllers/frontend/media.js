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


// ✅ Delete Media
export const deleteMedia = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedMedia = await Media.findByIdAndDelete(id);

    if (!deletedMedia) {
      return res.status(404).json({
        success: false,
        message: "Media not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Media deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting media:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete media",
      error: error.message,
    });
  }
};



// DELETE multiple media (by IDs)
export const deleteMultipleMedia = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of media IDs to delete.",
      });
    }

    // Find all media records that match the given IDs
    const mediaItems = await Media.find({ _id: { $in: ids } });

    if (mediaItems.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No matching media found.",
      });
    }

    // Delete files from Cloudinary
    const deleteResults = await Promise.all(
      mediaItems.map(async (item) => {
        try {
          if (item.cloudinaryPublicId) {
            await cloudinary.uploader.destroy(item.cloudinaryPublicId);
          }
          return { id: item._id, success: true };
        } catch (err) {
          console.error(`Failed to delete Cloudinary file for ${item._id}:`, err);
          return { id: item._id, success: false, error: err.message };
        }
      })
    );

    // Delete from MongoDB
    await Media.deleteMany({ _id: { $in: ids } });

    return res.status(200).json({
      success: true,
      message: "Media deleted successfully",
      results: deleteResults,
    });
  } catch (error) {
    console.error("Error deleting multiple media:", error);
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
    const {
      url,
      type,
      size,
      dimensions,
      name,
      tags,
      platform,
      uploadDate,
    } = req.body;

    const updatedFields = {
      ...(url && { url }),
      ...(type && { type }),
      ...(size && { size }),
      ...(dimensions && { dimensions }),
      ...(name && { name }),
      ...(platform && { platform }),
      ...(uploadDate && { uploadDate }),
      ...(tags && {
        tags: Array.isArray(tags)
          ? tags
          : typeof tags === "string"
          ? tags.split(",").map((t) => t.trim())
          : [],
      }),
    };

    const updatedMedia = await Media.findByIdAndUpdate(id, updatedFields, {
      new: true,
    });

    if (!updatedMedia) {
      return res.status(404).json({
        success: false,
        message: "Media not found",
      });
    }

    return res.status(200).json({
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
