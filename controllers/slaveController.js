import Slave from "../models/Slave.js";
import Master from "../models/Master.js";


export const createSlave = async (req, res) => {
    try {
        const {
            slaveId,
            masterId,
            type,
            name
        } = req.body;

        if (!slaveId || !masterId || !type || !name) {
            return res.status(400).json({
                success: false,
                message: "slaveId, masterId, type and name are required"
            });
        }

        // Check whether Master exists
        const master = await Master.findOne({ masterId });

        if (!master) {
            return res.status(404).json({
                success: false,
                message: "Master not found"
            });
        }

        // Check duplicate Slave
        const existingSlave = await Slave.findOne({ slaveId });

        if (existingSlave) {
            return res.status(409).json({
                success: false,
                message: "Slave already exists"
            });
        }

        const slave = await Slave.create({
            slaveId,
            masterId,
            type,
            name
        });

        res.status(201).json({
            success: true,
            message: "Slave created successfully",
            data: slave
        });

    } catch (error) {
        console.error("Error creating slave:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create slave"
        });
    }
};



export const getSlaves = async (req, res) => {
    try {
        const slaves = await Slave.find()
            .sort({ slaveId: 1 });

        res.status(200).json({
            success: true,
            data: slaves
        });
    } catch (error) {
        console.error("Error fetching slaves:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch slaves"
        });
    }
};



export const getSlave = async (req, res) => {
    try {
        const { slaveId } = req.params;
        const slave = await Slave.findOne({
            slaveId
        });

        if (!slave) {
            return res.status(404).json({
                success: false,
                message: "Slave not found"
            });
        }

        res.status(200).json({
            success: true,
            data: slave
        });

    } catch (error) {
        console.error("Error fetching slave:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch slave"
        });
    }
};



export const getSlavesByMaster = async (req, res) => {
    try {
        const { masterId } = req.params;
        const slaves = await Slave.find({
            masterId
        });

        res.status(200).json({
            success: true,
            data: slaves
        });

    } catch (error) {
        console.error(
            "Error fetching slaves for master:",
            error
        );
        res.status(500).json({
            success: false,
            message: "Failed to fetch slaves"
        });
    }
};



export const deleteSlave = async (req, res) => {
    try {
        const { slaveId } = req.params;
        const slave = await Slave.findOneAndDelete({
            slaveId
        });

        if (!slave) {
            return res.status(404).json({
                success: false,
                message: "Slave not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Slave deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting slave:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete slave"
        });
    }
};