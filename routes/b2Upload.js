import express from 'express';
import { deleteAllUserVideos, deleteUpload, getAllUploads, getAllUploadsAuthenticated, getB2SignedUrl, saveB2Metadata, uploadToB2 } from '../controllers/b2Upload.js';
import { authenticateApiKey, isAuthenticated } from '../middlewares/auth.js';
import { b2upload } from '../middlewares/b2upload.js';

const router = express.Router();

router.post('/upload', isAuthenticated, b2upload.single('file'), uploadToB2);
router.post('/sign-url', isAuthenticated, getB2SignedUrl);
router.post('/save-metadata', isAuthenticated, saveB2Metadata);
router.get('/uploads-forme', getAllUploads);
router.get('/videos',authenticateApiKey, getAllUploadsAuthenticated);
router.delete('/uploads/:id', deleteUpload);
router.delete('/uploads/user/:id', deleteAllUserVideos);
export default router;
