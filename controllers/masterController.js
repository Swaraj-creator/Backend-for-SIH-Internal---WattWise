import Master from "../models/Master.js";
import Slave from "../models/Slave.js";

const cleanText = (value) => typeof value === "string" ? value.trim() : "";
const error = (res, status, message) => res.status(status).json({ success: false, message });

export const getMasters = async (req, res, next) => {
    try {
        const masters = await Master.find({ userId: req.user.userId }).sort({ name: 1 });
        res.json({ success: true, data: masters });
    } catch (err) { next(err); }
};

export const getMastersByUserId = async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (!userId) return error(res, 400, "userId is required");

        const masters = await Master.find({ userId }).sort({ name: 1 });
        res.json({ success: true, data: masters });
    } catch (err) { next(err); }
};

export const getMaster = async (req, res, next) => {
    try {
        const master = await Master.findOne({ masterId: req.params.masterId, userId: req.user.userId });
        if (!master) return error(res, 404, "Master not found");
        const slaves = await Slave.find({ masterId: master.masterId }).sort({ slaveId: 1 });
        res.json({ success: true, data: { master, slaves } });
    } catch (err) { next(err); }
};

export const createMaster = async (req, res, next) => {
    try {
        const masterId = cleanText(req.body.masterId);
        const name = cleanText(req.body.name);
        if (!masterId || !name) return error(res, 400, "masterId and name are required");
        if (await Master.exists({ masterId })) return error(res, 409, "Master already exists");

        const master = await Master.create({ masterId, name, userId: req.user.userId });
        res.status(201).json({ success: true, data: master });
    } catch (err) { next(err); }
};

export const updateMaster = async (req, res, next) => {
    try {
        const name = cleanText(req.body.name);
        if (!name) return error(res, 400, "name is required");
        const master = await Master.findOneAndUpdate(
            { masterId: req.params.masterId, userId: req.user.userId },
            { $set: { name } },
            { new: true, runValidators: true }
        );
        if (!master) return error(res, 404, "Master not found");
        res.json({ success: true, data: master });
    } catch (err) { next(err); }
};

export const deleteMaster = async (req, res, next) => {
    try {
        const master = await Master.findOneAndDelete({ masterId: req.params.masterId, userId: req.user.userId });
        if (!master) return error(res, 404, "Master not found");
        await Slave.deleteMany({ masterId: master.masterId });
        res.json({ success: true, message: "Master and associated slaves deleted" });
    } catch (err) { next(err); }
};

export const registerMasterDevice = async (req, res, next) => {
    try {
        const masterId = cleanText(req.body.masterId);
        const userId = cleanText(req.body.userId);
        const name = cleanText(req.body.name) || masterId;

        if (!masterId || !userId) {
            return error(res, 400, "masterId and userId are required");
        }

        // Check if master already exists
        const existing = await Master.findOne({ masterId });
        if (existing) {
            // If it exists with the same userId, reuse it
            if (existing.userId.toString() === userId || existing.userId === userId) {
                return res.status(200).json({ success: true, data: existing, message: "Master already registered" });
            }
            // If it exists with a different userId, reject
            return error(res, 409, "Master ID already owned by another user");
        }

        // Create new master
        const master = await Master.create({ masterId, name, userId });
        res.status(201).json({ success: true, data: master });
    } catch (err) { next(err); }
};
