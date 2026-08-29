import MotionReading from "../models/MotionReading.js";
import PowerReading from "../models/PowerReading.js";

const buffers = new Map();
const minuteStart = (timestamp) => {
    const date = new Date(timestamp);
    date.setUTCSeconds(0, 0);
    return date;
};
const keyFor = (deviceId, slaveId, timestamp) => `${deviceId}:${slaveId}:${minuteStart(timestamp).getTime()}`;
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const flushBuffer = async (key) => {
    const buffer = buffers.get(key);
    if (!buffer || !buffer.readings.length) return buffers.delete(key);
    try {
        if (buffer.type === "motion") {
            const occupied = buffer.readings.filter(({ occupied }) => occupied).length >= buffer.readings.length / 2;
            await MotionReading.updateOne(
                { deviceId: buffer.deviceId, slaveId: buffer.slaveId, timestamp: buffer.timestamp },
                { $set: { occupied } }, { upsert: true }
            );
        } else {
            const appliancesById = new Map();
            for (const { appliances } of buffer.readings) {
                for (const appliance of appliances) {
                    const current = appliancesById.get(appliance.applianceId) || {
                        applianceId: appliance.applianceId, name: appliance.name, voltage: [], current: [], power: []
                    };
                    current.name = appliance.name;
                    current.voltage.push(appliance.voltage);
                    current.current.push(appliance.current);
                    current.power.push(appliance.power);
                    appliancesById.set(appliance.applianceId, current);
                }
            }
            const appliances = [...appliancesById.values()].map((appliance) => ({
                applianceId: appliance.applianceId, name: appliance.name,
                voltage: average(appliance.voltage), current: average(appliance.current), power: average(appliance.power)
            }));
            await PowerReading.updateOne(
                { deviceId: buffer.deviceId, slaveId: buffer.slaveId, timestamp: buffer.timestamp },
                { $set: { appliances } }, { upsert: true }
            );
        }
        buffers.delete(key);
    } catch (err) {
        console.error("Unable to persist buffered telemetry:", err.message);
        buffer.timer = scheduleFlush(key, buffer.timestamp, 5000);
    }
};

const scheduleFlush = (key, timestamp, minimumDelay = 50) => {
    const nextMinute = minuteStart(timestamp);
    nextMinute.setUTCMinutes(nextMinute.getUTCMinutes() + 1);
    const timer = setTimeout(() => void flushBuffer(key), Math.max(minimumDelay, nextMinute.getTime() - Date.now() + 50));
    timer.unref?.();
    return timer;
};

const addReading = (type, reading) => {
    const key = keyFor(reading.deviceId, reading.slaveId, reading.timestamp);
    if (!buffers.has(key)) {
        const timestamp = minuteStart(reading.timestamp);
        buffers.set(key, { type, deviceId: reading.deviceId, slaveId: reading.slaveId, timestamp, readings: [], timer: scheduleFlush(key, timestamp) });
    }
    buffers.get(key).readings.push(type === "motion" ? { occupied: reading.occupied } : { appliances: reading.appliances });
};

export const addTelemetryToBuffer = async ({ motion = [], power = [] }) => {
    motion.forEach((reading) => addReading("motion", reading));
    power.forEach((reading) => addReading("power", reading));
};

export const flushCompletedTelemetry = async () => {
    const entries = [...buffers.entries()].filter(([, buffer]) => buffer.timestamp.getTime() + 60000 <= Date.now());
    await Promise.all(entries.map(([key]) => flushBuffer(key)));
};
