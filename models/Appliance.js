import mongoose from "mongoose";

const Appliance = new mongoose.Schema({
    applianceId: {
        type: String,
        required: true,
        index: true
    },

    deviceId: {
        type: String,
        required: true,
        index: true
    },

    slaveId: {
        type: String,
        required: true,
        index: true
    },

    name: {
        type: String,
        required: true
    },

    relayIndex: {
        type: Number,
        required: true,
        min: 0,
        max: 3
    },

    status: {
        type: String,
        enum: ["on", "off"],
        default: "off"
    }
}, {
    timestamps: true
});

Appliance.index({
    deviceId: 1,
    slaveId: 1,
    applianceId: 1
}, {
    unique: true
});

export default mongoose.model("Appliance", Appliance);