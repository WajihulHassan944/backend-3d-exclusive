import express from "express";
import upload from "../../middlewares/upload.js"; 
import { isAuthenticated } from "../../middlewares/auth.js";
import { createPage, deletePage, getAllPages, getAllPagesAdminSide, getHomeSeo, getPageById, getPageByUrl, getPageStats, updatePage } from "../../controllers/frontend/page.js";

const router = express.Router();

router.post("/create",  upload.single("openGraphImage"), createPage);
router.get("/stats", getPageStats);
router.get("/all-for-admin", getAllPagesAdminSide);
router.get("/getHomeSeo", getHomeSeo);
router.get("/url/:url", getPageByUrl);
router.get("/", getAllPages);
router.get("/:id", getPageById);
router.put("/:id",isAuthenticated, upload.single("openGraphImage"), updatePage);
router.delete("/:id", deletePage);

export default router;
