import express from "express";
import { appleAuth,  deleteUserById, getAllUsers, getMyProfile, getUserById, googleLogin, googleRegister, handleContactForm, login, logout, promoteAdmins, register,  resetPasswordConfirm, resetPasswordRequest,  resetPasswordRequestEmail,  subscribeNewsletter,  toggleNewsletter,  unsubscribeNewsletter,  updateProfile, verifyEmail } from "../controllers/user.js";
import { isAuthenticated } from "../middlewares/auth.js";
import upload from "../middlewares/upload.js";

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
export default router;
