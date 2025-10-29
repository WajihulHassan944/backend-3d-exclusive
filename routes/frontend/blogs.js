import express from "express";
import {
  createBlog,
  updateBlog,
  getAllBlogs,
  getBlogById,
  deleteBlog,
  getBlogStats,
  publishScheduledBlogs,
  getBlogBySlug,
} from "../../controllers/frontend/blogs.js";

import upload from "../../middlewares/upload.js"; // multer memory-storage wrapper
import { isAuthenticated } from "../../middlewares/auth.js";

const router = express.Router();

router.get("/stats", isAuthenticated, getBlogStats);
router.get("/publish-scheduled", publishScheduledBlogs);
router.post("/create", isAuthenticated, upload.single("featuredImage"), createBlog);
router.put("/update/:id", isAuthenticated, upload.single("featuredImage"), updateBlog);
router.get("/get-blog-with-slug-url/:slug", getBlogBySlug);

router.get("/all", getAllBlogs);
router.get("/get-by-id/:id", getBlogById);
router.delete("/delete/:id", isAuthenticated, deleteBlog);

export default router;
