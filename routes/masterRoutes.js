import express from "express";

import {
    createMaster,
    getMasters,
    getMaster,
    deleteMaster,
    updateMasterConfig
} from "../controllers/masterController.js";

const router = express.Router();

router.post("/", createMaster);
router.get("/", getMasters);
router.get("/:masterId", getMaster);
router.delete("/:masterId", deleteMaster);
router.post("/config/:masterId", updateMasterConfig);

export default router;