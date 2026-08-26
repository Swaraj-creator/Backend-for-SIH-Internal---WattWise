import express from "express";

import {
    createMaster,
    getMasters,
    getMaster,
    deleteMaster
} from "../controllers/masterController.js";

const router = express.Router();

router.post("/", createMaster);
router.get("/", getMasters);
router.get("/:masterId", getMaster);
router.delete("/:masterId", deleteMaster);

export default router;