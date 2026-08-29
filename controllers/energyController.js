import Master from "../models/Master.js";
import PowerReading from "../models/PowerReading.js";

const invalidDate = (value) => value && Number.isNaN(new Date(value).getTime());

const buildMatch = async (query, userId) => {
    const { deviceId, slaveId, applianceId, start, end } = query;
    if (invalidDate(start) || invalidDate(end)) throw new Error("INVALID_DATE");
    const ownedMasters = await Master.find({ userId }).select("masterId");
    const ownedIds = ownedMasters.map(({ masterId }) => masterId);
    const match = { deviceId: deviceId ? deviceId : { $in: ownedIds } };
    if (deviceId && !ownedIds.includes(deviceId)) match.deviceId = { $in: [] };
    if (slaveId) match.slaveId = slaveId;
    if (start || end) {
        match.timestamp = {};
        if (start) match.timestamp.$gte = new Date(start);
        if (end) match.timestamp.$lt = new Date(end);
    }
    return { match, applianceId };
};

const energyPipeline = async (query, userId, unit) => {
    const { match, applianceId } = await buildMatch(query, userId);
    const pipeline = [{ $match: match }, { $unwind: "$appliances" }];
    if (applianceId) pipeline.push({ $match: { "appliances.applianceId": applianceId } });

    if (!unit) {
        pipeline.push({ $project: {
            _id: 0, deviceId: 1, slaveId: 1, applianceId: "$appliances.applianceId", name: "$appliances.name",
            energy: { $divide: ["$appliances.power", 60000] }, timestamp: 1
        } }, { $sort: { timestamp: 1 } });
        return pipeline;
    }

    pipeline.push({ $group: {
        _id: {
            deviceId: "$deviceId", slaveId: "$slaveId", applianceId: "$appliances.applianceId", name: "$appliances.name",
            periodStart: { $dateTrunc: { date: "$timestamp", unit, timezone: "UTC" } }
        },
        energy: { $sum: { $divide: ["$appliances.power", 60000] } }
    } }, { $project: {
        _id: 0, deviceId: "$_id.deviceId", slaveId: "$_id.slaveId", applianceId: "$_id.applianceId",
        name: "$_id.name", periodStart: "$_id.periodStart", energy: 1
    } }, { $sort: { periodStart: 1 } });
    return pipeline;
};

const getEnergyFor = (unit) => async (req, res, next) => {
    try {
        const data = await PowerReading.aggregate(await energyPipeline(req.query, req.user.userId, unit));
        res.json({ success: true, data });
    } catch (err) {
        if (err.message === "INVALID_DATE") return res.status(400).json({ success: false, message: "start and end must be valid dates" });
        next(err);
    }
};

export const getEnergy = getEnergyFor(null);
export const getHourlyEnergy = getEnergyFor("hour");
export const getDailyEnergy = getEnergyFor("day");
export const getMonthlyEnergy = getEnergyFor("month");
