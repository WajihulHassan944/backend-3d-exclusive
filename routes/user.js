import express from "express";
import { appleAuth,  deleteUserById, getAllUsers, getAllUsersDetailed, getMyProfile, getUserById, getUserStats, googleLogin, googleRegister, handleContactForm, login, logout, promoteAdmins, register,  resetPasswordConfirm, resetPasswordRequest,  resetPasswordRequestEmail,  subscribeNewsletter,  toggleNewsletter,  unsubscribeNewsletter,  updateProfile, updateUserPassword, verifyEmail } from "../controllers/user.js";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";
import { getAdminStats } from "../controllers/liveVisitors.js";

const router = express.Router();

router.post('/register', upload.single('profileImage'), register);
router.post("/google-login", googleLogin);
router.post("/google-register", googleRegister);
router.post("/callback/apple", appleAuth);
router.post("/login", login);
router.get("/logout", logout);
router.get("/userdetails", isAuthenticated, getMyProfile);
router.get("/all", getAllUsers);
router.delete("/delete-user/:id", deleteUserById);
router.get("/verify-email", verifyEmail);
router.get("/getUserById/:userId", getUserById);
router.post("/reset-password-request", resetPasswordRequest);
router.post("/reset-password", resetPasswordRequestEmail);
router.post("/reset-password-confirm", resetPasswordConfirm);
router.put("/update-profile", upload.single("profileImg"), updateProfile);
router.post('/contact', handleContactForm);
router.post('/toggle-newsletter', isAuthenticated, toggleNewsletter);
router.post('/subscribe', subscribeNewsletter);
router.get('/unsubscribe', unsubscribeNewsletter);
router.get("/promote-admins", promoteAdmins);
router.get("/stats", isAuthenticated,getUserStats);
router.get("/detailed", isAuthenticated, getAllUsersDetailed);
router.get("/dashboard-stats",  getAdminStats);

router.put("/update-password", updateUserPassword);
export default router;
