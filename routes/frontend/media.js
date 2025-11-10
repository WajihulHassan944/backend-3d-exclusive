import express from "express";
import {
  uploadMedia,
  getAllMedia,
  updateMedia,
  deleteMedia,
  getMediaStats,
  deleteMultipleMedia,
} from "../../controllers/frontend/media.js";

import upload from "../../middlewares/upload.js"; // same multer memory-storage setup

const router = express.Router();

router.post("/upload", upload.single("file"), uploadMedia);
router.get("/all", getAllMedia);
router.put("/update/:id", upload.single("file"), updateMedia);
router.delete("/delete/:id", deleteMedia);
router.get("/stats", getMediaStats);
router.delete("/delete-multiple", deleteMultipleMedia);

export default router;
