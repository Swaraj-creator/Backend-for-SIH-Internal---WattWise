import express from "express";
import { getTelemetry, postTelemetry, syncTelemetry } from "../controllers/telemetryController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/", protect, getTelemetry);
router.post("/", postTelemetry);
router.post("/sync", syncTelemetry);

export default router;
