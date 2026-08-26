import Master from "../models/Master.js";
import Slave from "../models/Slave.js";

const OFFLINE_THRESHOLD = 30 * 1000;

export const checkDeviceStatus = async () => {
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
            error
        );
    }
};


export const startDeviceStatusService = () => {
    checkDeviceStatus();
    setInterval(() => {
        checkDeviceStatus();
    }, 10000);
};