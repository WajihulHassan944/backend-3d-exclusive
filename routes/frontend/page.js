import express from "express";
import upload from "../../middlewares/upload.js"; 
import { isAuthenticated } from "../../middlewares/auth.js";
import { createPage, deletePage, getAllPages, getAllPagesAdminSide, getComingSoonStatus, getHomeSeo, getPageById, getPageByUrl, getPageStats, toggleComingSoon, updatePage } from "../../controllers/frontend/page.js";

const router = express.Router();

router.post("/create",  upload.single("openGraphImage"), createPage);
router.get("/stats", getPageStats);
router.get("/all-for-admin", getAllPagesAdminSide);
router.put("/toggle-coming-soon", toggleComingSoon);
router.get("/coming-soon/status", getComingSoonStatus);
router.get("/getHomeSeo", getHomeSeo);
router.get("/url/:url", getPageByUrl);
router.get("/", getAllPages);
router.get("/:id", getPageById);
router.put("/:id",isAuthenticated, upload.single("openGraphImage"), updatePage);
router.delete("/:id", deletePage);


export default router;
