import Master from "../models/Master.js";
import Slave from "../models/Slave.js";

const cleanText = (value) => typeof value === "string" ? value.trim() : "";
const error = (res, status, message) => res.status(status).json({ success: false, message });

export const getSlaves = async (req, res, next) => {
    try {
        const masters = await Master.find({ userId: req.params.userId }).select("masterId");

        const slaves = await Slave.find({
            masterId: { $in: masters.map(({ masterId }) => masterId) }
        }).sort({ slaveId: 1 });

        if (!slaves.length) {
            return error(res, 404, "No slaves found for this user");
        }

        res.json({
            success: true,
            data: slaves
        });
    } catch (err) {
        next(err);
    }
};

export const createSlave = async (req, res, next) => {
    try {
        const slaveId = cleanText(req.body.slaveId);
        const masterId = cleanText(req.body.masterId);
        const name = cleanText(req.body.name);
        const { type } = req.body;

        if (!slaveId || !masterId || !name || !["motion", "power"].includes(type)) {
            return error(res, 400, "slaveId, masterId, a valid type, and name are required");
        }

        if (await Slave.exists({ slaveId })) {
            return error(res, 409, "Slave already exists");
        }

        const slave = await Slave.create({
            slaveId,
            masterId,
            type,
            name
        });

        res.status(201).json({
            success: true,
            data: slave
        });
    } catch (err) {
        next(err);
    }
};

export const getSlavesByUserId = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { slaveId, type } = req.query;

        if (!userId) {
            return error(res, 400, "userId is required");
        }

        // slaveId provided → find or create slave
        if (slaveId) {
            const cleanSlaveId = cleanText(slaveId);

            // Find the user's Master
            const master = await Master.findOne({ userId });

            if (!master) {
                return error(res, 404, "Master not found");
            }

            // Check whether this slave already exists
            const existingSlave = await Slave.findOne({
                slaveId: cleanSlaveId
            });

            if (existingSlave) {
                return res.json({
                    success: true,
                    data: existingSlave,
                    created: false
                });
            }

            // Slave doesn't exist → create it using master's masterId
            const slave = await Slave.create({
                slaveId: cleanSlaveId,
                masterId: master.masterId,
                type: type,
                name: cleanSlaveId
            });

            return res.status(201).json({
                success: true,
                data: slave,
                created: true
            });
        }

        // No slaveId → return all slaves belonging to user's masters
        const masters = await Master.find({ userId }).select("masterId");

        const slaves = await Slave.find({
            masterId: {
                $in: masters.map(({ masterId }) => masterId)
            }
        }).sort({ slaveId: 1 });

        if (!slaves.length) {
            return error(res, 404, "No slaves found for this user");
        }

        res.json({
            success: true,
            data: slaves
        });
    } catch (err) {
        next(err);
    }
};

export const getSlave = async (req, res, next) => {
    try {
        const slave = await Slave.findOne({
            slaveId: req.params.slaveId
        });

        if (!slave) {
            return error(res, 404, "Slave not found");
        }

        res.json({
            success: true,
            data: slave
        });
    } catch (err) {
        next(err);
    }
};

export const updateSlave = async (req, res, next) => {
    try {
        const slave = await Slave.findOne({
            slaveId: req.params.slaveId
        });

        if (!slave) {
            return error(res, 404, "Slave not found");
        }

        const updates = {};

        if (Object.hasOwn(req.body, "name")) {
            const name = cleanText(req.body.name);

            if (!name) {
                return error(res, 400, "name must be a non-empty string");
            }

            updates.name = name;
        }

        if (Object.hasOwn(req.body, "type")) {
            if (!["motion", "power"].includes(req.body.type)) {
                return error(res, 400, "type must be motion or power");
            }

            updates.type = req.body.type;
        }

        if (!Object.keys(updates).length) {
            return error(res, 400, "Provide name or type to update");
        }

        Object.assign(slave, updates);

        await slave.save();

        res.json({
            success: true,
            data: slave
        });
    } catch (err) {
        next(err);
    }
};

export const deleteSlave = async (req, res, next) => {
    try {
        const slave = await Slave.findOne({
            slaveId: req.params.slaveId
        });

        if (!slave) {
            return error(res, 404, "Slave not found");
        }

        await slave.deleteOne();

        res.json({
            success: true,
            message: "Slave deleted"
        });
    } catch (err) {
        next(err);
    }
};