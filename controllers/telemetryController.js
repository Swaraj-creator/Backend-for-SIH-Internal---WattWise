import Master from "../models/Master.js";
import Slave from "../models/Slave.js";
import MotionReading from "../models/MotionReading.js";
import PowerReading from "../models/PowerReading.js";
import { broadcastTelemetry } from "../websocket/telemetrySocket.js";
import { addTelemetryToBuffer } from "../services/telemetryBufferService.js";


export const getTelemetry = async (req, res) => {
    try {
        const [motionReadings, powerReadings] = await Promise.all([
            MotionReading.find()
                .sort({ timestamp: -1 })
                .limit(100),
            PowerReading.find()
                .sort({ timestamp: -1 })
                .limit(100)
        ]);

        res.status(200).json({
            success: true,

            data: {
                motion: motionReadings,
                power: powerReadings
            }
        });

    } catch (error) {
        console.error("Error fetching telemetry:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch telemetry"
        });
    }
};


export const postTelemetry = async (req, res) => {
    try {
        console.log("Telemetry received:");
        const { deviceId, slaves } = req.body;

        // Validate deviceId
        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: "deviceId is required"
            });
        }

        // Validate slaves array
        if (!Array.isArray(slaves)) {
            return res.status(400).json({
                success: false,
                message: "slaves must be an array"
            });
        }

        // Verify Master
        const master = await Master.findOne({masterId: deviceId});

        if (!master) {
            return res.status(404).json({
                success: false,
                message: `Unknown Master: ${deviceId}`
            });
        }

        // Get registered Slaves
        const slaveIds = slaves.map(slave => slave.slaveId);
        const registeredSlaves = await Slave.find({slaveId: {$in: slaveIds}});

        // Create quick lookup map
        const slaveMap = new Map(
            registeredSlaves.map(slave => [
                slave.slaveId,
                slave
            ])
        );

        const motionReadings = [];
        const powerReadings = [];

        // Validate every Slave
        for (const slave of slaves) {
            if (!slave.slaveId || !slave.type) {
                return res.status(400).json({
                    success: false,
                    message: "Every slave must contain slaveId and type"
                });
            }

            // Check slave exists
            const registeredSlave = slaveMap.get(slave.slaveId);

            if (!registeredSlave) {
                return res.status(404).json({
                    success: false,
                    message: `Unknown slave: ${slave.slaveId}`
                });
            }

            // Check slave belongs to Master
            if (registeredSlave.masterId !== deviceId) {
                return res.status(403).json({
                    success: false,
                    message: `Slave ${slave.slaveId} does not belong to Master ${deviceId}`
                });
            }

            // Check slave type
            if (registeredSlave.type !== slave.type) {
                return res.status(400).json({
                    success: false,
                    message: `Slave type mismatch for ${slave.slaveId}`
                });
            }

            // Validate timestamp
            if (!slave.timestamp) {
                return res.status(400).json({
                    success: false,
                    message: `timestamp is required for slave ${slave.slaveId}`
                });
            }

            const timestamp = new Date(slave.timestamp);

            if (Number.isNaN(timestamp.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid timestamp for slave ${slave.slaveId}`
                });
            }

            // Motion Slave
            if (slave.type === "motion") {
                if (typeof slave.occupied !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        message: `occupied must be a boolean for motion slave ${slave.slaveId}`
                    });
                }

                motionReadings.push({
                    deviceId,
                    slaveId: slave.slaveId,
                    occupied: slave.occupied,
                    timestamp
                });
            }

            // Power Slave
            else if (slave.type === "power") {
                if (!Array.isArray(slave.appliances)) {
                    return res.status(400).json({
                        success: false,
                        message: `appliances must be an array for power slave ${slave.slaveId}`
                    });
                }

                powerReadings.push({
                    deviceId,
                    slaveId: slave.slaveId,
                    appliances: slave.appliances,
                    timestamp
                });
            }

            // Unsupported Slave type
            else {
                return res.status(400).json({
                    success: false,
                    message: `Unsupported slave type: ${slave.type}`
                });
            }
        }

        // Broadcast live telemetry
        const telemetry = {
            deviceId,
            motion: motionReadings,
            power: powerReadings
        };

        broadcastTelemetry(telemetry);
        await addTelemetryToBuffer(telemetry);

        // Update Master status
        const now = new Date();
        master.status = "online";
        master.lastSeen = now;
        await master.save();

        // Update Slave status
        await Slave.updateMany(
            {
                slaveId: {
                    $in: slaveIds
                },
                masterId: deviceId
            },
            {
                $set: {
                    status: "online",
                    lastSeen: now
                }
            }
        );

        // Response
        res.status(200).json({
            success: true,
            message: "Live telemetry received successfully",
            data: telemetry
        });

    } catch (error) {
        console.error("Error processing telemetry:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process telemetry",
            error: error.message
        });
    }
};


export const syncTelemetry = async (req, res) => {
    try {
        console.log("Sync telemetry received:");

        const { deviceId, readings } = req.body;

        // Validate deviceId
        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: "deviceId is required"
            });
        }

        // Validate readings array
        if (!Array.isArray(readings)) {
            return res.status(400).json({
                success: false,
                message: "readings must be an array"
            });
        }

        if (readings.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No readings to synchronize",
                synced: 0
            });
        }

        // Verify Master
        const master = await Master.findOne({
            masterId: deviceId
        });

        if (!master) {
            return res.status(404).json({
                success: false,
                message: `Unknown Master: ${deviceId}`
            });
        }

        // Get registered Slaves
        const slaveIds = readings.map(reading => reading.slaveId);
        const registeredSlaves = await Slave.find({slaveId: {$in: slaveIds}});

        // Create quick lookup map
        const slaveMap = new Map(
            registeredSlaves.map(slave => [
                slave.slaveId,
                slave
            ])
        );

        const motionOperations = [];
        const powerOperations = [];

        // Validate every reading
        for (const reading of readings) {
            if (!reading.slaveId || !reading.type) {
                return res.status(400).json({
                    success: false,
                    message: "Every reading must contain slaveId and type"
                });
            }

            // Check slave exists
            const registeredSlave = slaveMap.get(reading.slaveId);

            if (!registeredSlave) {
                return res.status(404).json({
                    success: false,
                    message: `Unknown slave: ${reading.slaveId}`
                });
            }

            // Check slave belongs to Master
            if (registeredSlave.masterId !== deviceId) {
                return res.status(403).json({
                    success: false,
                    message: `Slave ${reading.slaveId} does not belong to Master ${deviceId}`
                });
            }

            // Check slave type
            if (registeredSlave.type !== reading.type) {
                return res.status(400).json({
                    success: false,
                    message: `Slave type mismatch for ${reading.slaveId}`
                });
            }

            // Validate timestamp
            if (!reading.timestamp) {
                return res.status(400).json({
                    success: false,
                    message: `timestamp is required for slave ${reading.slaveId}`
                });
            }

            const timestamp = new Date(reading.timestamp);

            if (Number.isNaN(timestamp.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid timestamp for slave ${reading.slaveId}`
                });
            }

            // Motion Slave
            if (reading.type === "motion") {
                if (typeof reading.occupied !== "boolean") {
                    return res.status(400).json({
                        success: false,
                        message: `occupied must be a boolean for ${reading.slaveId}`
                    });
                }

                motionOperations.push({
                    updateOne: {
                        filter: {
                            deviceId,
                            slaveId: reading.slaveId,
                            timestamp
                        },
                        update: {
                            $set: {
                                occupied: reading.occupied
                            }
                        },
                        upsert: true
                    }
                });
            }

            // Power Slave
            else if (reading.type === "power") {
                if (!Array.isArray(reading.appliances)) {
                    return res.status(400).json({
                        success: false,
                        message: `appliances must be an array for ${reading.slaveId}`
                    });
                }

                powerOperations.push({
                    updateOne: {
                        filter: {
                            deviceId,
                            slaveId: reading.slaveId,
                            timestamp
                        },
                        update: {
                            $set: {
                                appliances: reading.appliances
                            }
                        },
                        upsert: true
                    }
                });
            }

            // Unsupported Slave type
            else {
                return res.status(400).json({
                    success: false,
                    message: `Unsupported slave type: ${reading.type}`
                });
            }
        }

        // Save historical readings
        const [motionResult, powerResult] = await Promise.all([
            motionOperations.length > 0 ? MotionReading.bulkWrite(motionOperations) : null,
            powerOperations.length > 0 ? PowerReading.bulkWrite(powerOperations) : null
        ]);

        // Update Master status
        const now = new Date();

        master.status = "online";
        master.lastSeen = now;

        await master.save();

        // Update Slave status
        await Slave.updateMany(
            {
                slaveId: {
                    $in: slaveIds
                },
                masterId: deviceId
            },
            {
                $set: {
                    status: "online",
                    lastSeen: now
                }
            }
        );

        // Calculate synced count
        const motionSynced =
            (motionResult?.upsertedCount || 0) +
            (motionResult?.modifiedCount || 0);

        const powerSynced =
            (powerResult?.upsertedCount || 0) +
            (powerResult?.modifiedCount || 0);

        const synced = motionSynced + powerSynced;

        // Response
        res.status(200).json({
            success: true,
            message: "Historical telemetry synchronized successfully",
            synced
        });

    } catch (error) {
        console.error("Error synchronizing telemetry:", error);
        res.status(500).json({
            success: false,
            message: "Failed to synchronize telemetry",
            error: error.message
        });
    }
};