import Master from "../models/Master.js";
import Slave from "../models/Slave.js";
import MotionReading from "../models/MotionReading.js";
import PowerReading from "../models/PowerReading.js";
import { addTelemetryToBuffer } from "../services/telemetryBufferService.js";
import { broadcastTelemetry } from "../websocket/telemetrySocket.js";

const error = (res, status, message) => res.status(status).json({ success: false, message });
const cleanText = (value) => typeof value === "string" ? value.trim() : "";
const validDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const validateAppliances = (appliances, slaveId) => {
    if (!Array.isArray(appliances)) return `appliances must be an array for ${slaveId}`;
    for (const appliance of appliances) {
        if (!appliance || !cleanText(appliance.applianceId) || !cleanText(appliance.name)) {
            return `Every appliance for ${slaveId} needs applianceId and name`;
        }
        if (![appliance.voltage, appliance.current, appliance.power].every(Number.isFinite)) {
            return `Every appliance for ${slaveId} needs finite voltage, current, and power values`;
        }
    }
    return null;
};

const validateReadings = async (deviceId, readings) => {
    const master = await Master.findOne({ masterId: deviceId });
    if (!master) return { status: 404, message: "Unknown master" };

    const slaveIds = readings.map(({ slaveId }) => cleanText(slaveId)).filter(Boolean);
    const registered = await Slave.find({ masterId: deviceId, slaveId: { $in: slaveIds } });
    const slaveMap = new Map(registered.map((slave) => [slave.slaveId, slave]));
    const motion = [];
    const power = [];

    for (const reading of readings) {
        const slaveId = cleanText(reading?.slaveId);
        if (!slaveId || !["motion", "power"].includes(reading?.type)) {
            return { status: 400, message: "Every reading needs slaveId and a valid type" };
        }
        const registeredSlave = slaveMap.get(slaveId);
        if (!registeredSlave) return { status: 404, message: `Unknown slave: ${slaveId}` };
        if (registeredSlave.type !== reading.type) return { status: 400, message: `Slave type mismatch for ${slaveId}` };

        const timestamp = typeof reading.timestamp === "string" && validDate(reading.timestamp);
        if (!timestamp) return { status: 400, message: `Invalid timestamp for ${slaveId}` };

        if (reading.type === "motion") {
            if (typeof reading.occupied !== "boolean") return { status: 400, message: `occupied must be a boolean for ${slaveId}` };
            motion.push({ deviceId, slaveId, occupied: reading.occupied, timestamp });
        } else {
            const applianceError = validateAppliances(reading.appliances, slaveId);
            if (applianceError) return { status: 400, message: applianceError };
            power.push({
                deviceId,
                slaveId,
                appliances: reading.appliances.map((appliance) => ({
                    applianceId: cleanText(appliance.applianceId), name: cleanText(appliance.name),
                    voltage: appliance.voltage, current: appliance.current, power: appliance.power
                })),
                timestamp
            });
        }
    }
    return { master, motion, power, slaveIds: [...new Set(slaveIds)] };
};

const markDevicesOnline = async (master, slaveIds) => {
    const now = new Date();
    await Promise.all([
        Master.updateOne({ _id: master._id }, { $set: { status: "online", lastSeen: now } }),
        Slave.updateMany({ masterId: master.masterId, slaveId: { $in: slaveIds } }, { $set: { status: "online", lastSeen: now } })
    ]);
};

export const getTelemetry = async (req, res, next) => {
    try {
        const userId = cleanText(req.query?.userId || req.body?.userId || req.user?.userId);
        if (!userId) return error(res, 400, "userId is required");

        const masters = await Master.find({ userId }).select("masterId");
        const deviceIds = masters.map(({ masterId }) => masterId);
        const [motion, power] = await Promise.all([
            MotionReading.find({ deviceId: { $in: deviceIds } }).sort({ timestamp: -1 }).limit(100),
            PowerReading.find({ deviceId: { $in: deviceIds } }).sort({ timestamp: -1 }).limit(100)
        ]);
        res.json({ success: true, data: { motion, power } });
    } catch (err) { next(err); }
};

export const postTelemetry = async (req, res, next) => {
    try {
        const deviceId = cleanText(req.body.deviceId);
        const { slaves } = req.body;
        if (!deviceId) return error(res, 400, "deviceId is required");
        if (!Array.isArray(slaves)) return error(res, 400, "slaves must be an array");

        const result = await validateReadings(deviceId, slaves);
        if (result.status) return error(res, result.status, result.message);
        const telemetry = { deviceId, motion: result.motion, power: result.power };
        broadcastTelemetry(telemetry);
        await Promise.all([addTelemetryToBuffer(telemetry), markDevicesOnline(result.master, result.slaveIds)]);
        res.json({ success: true, data: telemetry });
    } catch (err) { next(err); }
};

export const syncTelemetry = async (req, res, next) => {
    try {
        const deviceId = cleanText(req.body.deviceId);
        const { readings } = req.body;
        if (!deviceId) return error(res, 400, "deviceId is required");
        if (!Array.isArray(readings)) return error(res, 400, "readings must be an array");
        if (!readings.length) return res.json({ success: true, data: { synced: 0 } });

        const result = await validateReadings(deviceId, readings);
        if (result.status) return error(res, result.status, result.message);
        const toOperation = (reading) => ({ updateOne: {
            filter: { deviceId, slaveId: reading.slaveId, timestamp: reading.timestamp },
            update: { $set: { ...reading } }, upsert: true
        } });
        const [motionResult, powerResult] = await Promise.all([
            result.motion.length ? MotionReading.bulkWrite(result.motion.map(toOperation)) : null,
            result.power.length ? PowerReading.bulkWrite(result.power.map(toOperation)) : null
        ]);
        await markDevicesOnline(result.master, result.slaveIds);
        const synced = (motionResult?.upsertedCount || 0) + (motionResult?.modifiedCount || 0) +
            (powerResult?.upsertedCount || 0) + (powerResult?.modifiedCount || 0);
        res.json({ success: true, data: { synced } });
    } catch (err) { next(err); }
};
