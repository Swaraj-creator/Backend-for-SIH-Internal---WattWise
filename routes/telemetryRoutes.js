import express from "express";
import { getTelemetry, postTelemetry, syncTelemetry } from "../controllers/telemetryController.js";

const router = express.Router();

router.get("/", getTelemetry);
router.post("/data", postTelemetry);
router.post("/sync", syncTelemetry);

export default router;