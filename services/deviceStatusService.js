import mongoose from "mongoose";
import Master from "../models/Master.js";
import Slave from "../models/Slave.js";

const OFFLINE_THRESHOLD = 30 * 1000;
const DEVICE_STATUS_INTERVAL_MS = 30000;

export const checkDeviceStatus = async () => {
    if (mongoose.connection.readyState !== 1) {
        return;
    }

    try {
        const cutoffTime = new Date(
            Date.now() - OFFLINE_THRESHOLD
        );

        await Master.updateMany(
            {
                status: "online",
                lastSeen: { $lt: cutoffTime }
            },
            {
                $set: {
                    status: "offline"
                }
            }
        );

        await Slave.updateMany(
            {
                status: "online",
                lastSeen: { $lt: cutoffTime }
            },
            {
                $set: {
                    status: "offline"
                }
            }
        );

    } catch (error) {
        console.error(
            "Error checking device status:",
            error.message || error
        );
    }
};

export const startDeviceStatusService = () => {
    checkDeviceStatus();
    const interval = setInterval(() => {
        checkDeviceStatus();
    }, DEVICE_STATUS_INTERVAL_MS);
    interval.unref?.();
    return interval;
};
