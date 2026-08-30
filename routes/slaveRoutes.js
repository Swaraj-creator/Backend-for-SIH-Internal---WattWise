import express from "express";

import {
    createSlave,
    getSlaves,
    getSlavesByUserId,
    getSlave,
    updateSlave,
    deleteSlave
} from "../controllers/slaveController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.get("/:userId", getSlavesByUserId);
// router.use(protect);
router.get("/", getSlaves);
router.get("/:slaveId", getSlave);
router.post("/", createSlave);
router.put("/:slaveId", updateSlave);
router.delete("/:slaveId", deleteSlave);

export default router;
