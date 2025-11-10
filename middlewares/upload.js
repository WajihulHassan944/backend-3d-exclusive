import multer from "multer";
import path from "path";

// ✅ Memory storage for Cloudinary upload (no saving to disk)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max for videos
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|mp4|mov|avi|mkv|webm/;
    const mimetype = filetypes.test(file.mimetype.toLowerCase());
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }

    cb(
      new Error(
        "Only image and video files are allowed (jpeg, jpg, png, gif, mp4, mov, avi, mkv, webm)"
      )
    );
  },
});

export default upload;
