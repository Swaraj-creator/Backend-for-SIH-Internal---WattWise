import express from "express";

import {
    createSlave,
    getSlaves,
    getSlave,
    getSlavesByMaster,
    deleteSlave
} from "../controllers/slaveController.js";

const router = express.Router();

router.post("/", createSlave);
router.get("/", getSlaves);
router.get("/:slaveId", getSlave);
router.get("/slavesof/:masterId", getSlavesByMaster);
router.delete("/:slaveId", deleteSlave);

export default router;