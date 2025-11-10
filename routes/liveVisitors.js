import express from "express";
import { getLiveVisitors, userConnected, userDisconnected } from "../controllers/liveVisitors.js";

const router = express.Router();

router.post("/connect", userConnected);
router.post("/disconnect", userDisconnected);
router.get("/count", getLiveVisitors);

export default router;
