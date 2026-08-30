import express from "express";
import { getTelemetry, postTelemetry, syncTelemetry, setStatusSignals, getStatusSignals } from "../controllers/telemetryController.js";

const router = express.Router();

router.get("/", getTelemetry);
router.post("/", postTelemetry);
router.post("/sync", syncTelemetry);
router.patch("/signals/:applianceId", setStatusSignals);
router.get("/signals", getStatusSignals);

export default router;
