import mongoose from "mongoose";

const Slave = new mongoose.Schema({
    slaveId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    masterId: {
        type: String,
        required: true,
        index: true
    },

    type: {
        type: String,
        required: true,
        enum: ["motion", "power"]
    },

    name: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["online", "offline"],
        default: "offline"
    },

    lastSeen: {
        type: Date,
        default: null
    }
});

export default mongoose.model("Slave", Slave);