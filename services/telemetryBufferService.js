import PowerReading from "../models/PowerReading.js";
import MotionReading from "../models/MotionReading.js";

const buffers = new Map();

const getBufferKey = (deviceId, slaveId, timestamp) => {
    const date = new Date(timestamp);
    date.setSeconds(0, 0);
    return `${deviceId}:${slaveId}:${date.getTime()}`;
};

const average = values => {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};


const getMinuteTimestamp = timestamp => {
    const date = new Date(timestamp);
    date.setSeconds(0, 0);
    return date;
};


export const addTelemetryToBuffer = async telemetry => {
    try {
        const { deviceId, motion, power } = telemetry;

        // Add Motion readings
        for (const reading of motion) {
            const timestamp = new Date(reading.timestamp);
            const key = getBufferKey(deviceId, reading.slaveId, timestamp);

            if (!buffers.has(key)) {
                buffers.set(key, {
                    type: "motion",
                    deviceId,
                    slaveId: reading.slaveId,
                    timestamp: getMinuteTimestamp(timestamp),
                    readings: []
                });
            }

            const buffer = buffers.get(key);

            buffer.readings.push({
                occupied: reading.occupied,
                timestamp
            });
        }


        // Add Power readings
        for (const reading of power) {
            const timestamp = new Date(reading.timestamp);
            const key = getBufferKey(deviceId, reading.slaveId, timestamp);

            if (!buffers.has(key)) {
                buffers.set(key, {
                    type: "power",
                    deviceId,
                    slaveId: reading.slaveId,
                    timestamp: getMinuteTimestamp(timestamp),
                    readings: []
                });
            }

            const buffer = buffers.get(key);

            buffer.readings.push({
                appliances: reading.appliances,
                timestamp
            });
        }


        // Process completed minute buffers
        for (const [key, buffer] of buffers) {
            const now = new Date();
            const minuteEnd = new Date(buffer.timestamp);
            minuteEnd.setMinutes(minuteEnd.getMinutes() + 1);

            if (now < minuteEnd) {
                continue;
            }


            // Process Motion buffer
            if (buffer.type === "motion") {
                const readings = buffer.readings;

                if (readings.length === 0) {
                    buffers.delete(key);
                    continue;
                }

                const occupiedCount = readings.filter(
                    reading => reading.occupied
                ).length;

                const occupied =
                    occupiedCount >= readings.length / 2;


                await MotionReading.updateOne(
                    {
                        deviceId: buffer.deviceId,
                        slaveId: buffer.slaveId,
                        timestamp: buffer.timestamp
                    },
                    {
                        $set: {
                            occupied
                        }
                    },
                    {
                        upsert: true
                    }
                );

                buffers.delete(key);
            }


            // Process Power buffer
            else if (buffer.type === "power") {
                const readings = buffer.readings;

                if (readings.length === 0) {
                    buffers.delete(key);
                    continue;
                }

                const applianceMap = new Map();


                // Collect appliance readings
                for (const sample of readings) {
                    for (const appliance of sample.appliances) {
                        if (!applianceMap.has(appliance.applianceId)) {
                            applianceMap.set(appliance.applianceId, {
                                applianceId: appliance.applianceId,
                                name: appliance.name,
                                voltage: [],
                                current: [],
                                power: []
                            });
                        }

                        const stored =
                            applianceMap.get(appliance.applianceId);

                        stored.voltage.push(
                            Number(appliance.voltage)
                        );

                        stored.current.push(
                            Number(appliance.current)
                        );

                        stored.power.push(
                            Number(appliance.power)
                        );
                    }
                }


                // Calculate appliance averages
                const appliances = [];

                for (const appliance of applianceMap.values()) {
                    appliances.push({
                        applianceId: appliance.applianceId,
                        name: appliance.name,
                        voltage: average(appliance.voltage),
                        current: average(appliance.current),
                        power: average(appliance.power)
                    });
                }


                // Save minute average
                await PowerReading.updateOne(
                    {
                        deviceId: buffer.deviceId,
                        slaveId: buffer.slaveId,
                        timestamp: buffer.timestamp
                    },
                    {
                        $set: {
                            appliances
                        }
                    },
                    {
                        upsert: true
                    }
                );

                buffers.delete(key);
            }
        }

    } catch (error) {
        console.error(
            "Error buffering telemetry:",
            error
        );
    }
};