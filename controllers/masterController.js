import Master from "../models/Master.js";

export const createMaster = async (req, res) => {
    try {
        const { masterId, name } = req.body;

        if (!masterId || !name) {
            return res.status(400).json({
                success: false,
                message: "masterId and name are required"
            });
        }

        const existingMaster = await Master.findOne({ masterId });

        if (existingMaster) {
            return res.status(409).json({
                success: false,
                message: "Master already exists"
            });
        }

        const master = await Master.create({
            masterId,
            name
        });

        res.status(201).json({
            success: true,
            message: "Master created successfully",
            data: master
        });

    } catch (error) {
        console.error("Error creating master:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create master"
        });
    }
};


export const getMasters = async (req, res) => {
    try {
        const masters = await Master.find()
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: masters
        });

    } catch (error) {
        console.error("Error fetching masters:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch masters"
        });
    }
};


export const getMaster = async (req, res) => {
    try {
        const { masterId } = req.params;
        const master = await Master.findOne({ masterId });

        if (!master) {
            return res.status(404).json({
                success: false,
                message: "Master not found"
            });
        }

        res.status(200).json({
            success: true,
            data: master
        });

    } catch (error) {
        console.error("Error fetching master:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch master"
        });
    }
};


export const deleteMaster = async (req, res) => {
    try {
        const { masterId } = req.params;
        const master = await Master.findOneAndDelete({ masterId });

        if (!master) {
            return res.status(404).json({
                success: false,
                message: "Master not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Master deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting master:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete master"
        });
    }
};


import Master from "../models/Master.js";


// ============================================================
// GET CONFIGURATION FOR ESP
// ============================================================
//
// POST /api/masters/config/:masterId
//
// The ESP calls this endpoint periodically.
//
// The controller:
// 1. Finds the master
// 2. Checks whether it is revoked
// 3. Returns the stored configuration
//
// ============================================================

export const getMasterConfig = async (req, res) => {

    try {

        const { masterId } = req.params;


        // ----------------------------------------------------
        // FIND MASTER
        // ----------------------------------------------------

        const master = await Master.findOne({
            masterId
        });


        if (!master) {

            return res.status(404).json({

                status: "revoked",

                message: "Master not found"

            });
        }


        // ----------------------------------------------------
        // RETURN CONFIGURATION
        // ----------------------------------------------------

        return res.status(200).json({

            status: "active",

            masterId: master.masterId,

            wifi: {

                ssid: master.wifi?.ssid || "",

                password: master.wifi?.password || ""

            },

            espNow: {

                channel:
                    master.espNow?.channel || 11,

                slave1MAC:
                    master.espNow?.slave1MAC || "",

                slave2MAC:
                    master.espNow?.slave2MAC || ""

            },

            configSyncInterval:
                master.configSyncInterval || 60000

        });

    }

    catch (error) {

        console.error(
            "Config controller error:",
            error
        );


        return res.status(500).json({

            status: "error",

            message:
                "Failed to retrieve master configuration"

        });
    }
};