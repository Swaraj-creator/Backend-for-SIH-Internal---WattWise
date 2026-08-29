import express from "express";
import {
    getMasters,
    getMastersByUserId,
    getMaster,
    createMaster,
    updateMaster,
    deleteMaster
} from "../controllers/masterController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/user/:userId", getMastersByUserId);
router.use(protect);
router.get("/", getMasters);
router.get("/:masterId", getMaster);
router.post("/", createMaster);
router.put("/:masterId", updateMaster);
router.delete("/:masterId", deleteMaster);

export default router;
