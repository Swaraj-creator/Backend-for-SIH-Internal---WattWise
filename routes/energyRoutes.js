import express from "express";
import {
    getEnergy,
    getHourlyEnergy,
    getDailyEnergy,
    getMonthlyEnergy
} from "../controllers/energyController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();


router.use(protect);
router.get("/", getEnergy);
router.get("/hourly", getHourlyEnergy);
router.get("/daily", getDailyEnergy);
router.get("/monthly", getMonthlyEnergy);


export default router;
