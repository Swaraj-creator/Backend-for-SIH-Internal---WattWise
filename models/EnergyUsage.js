import mongoose from "mongoose";

const energyUsageSchema = new mongoose.Schema({
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

    applianceId: {
        type: String,
        required: true,
        index: true
    },

    energy: {
        type: Number,
        required: true,
        min: 0
    },

    periodStart: {
        type: Date,
        required: true,
        index: true
    },

    periodEnd: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

energyUsageSchema.index({
    deviceId: 1,
    slaveId: 1,
    applianceId: 1,
    periodStart: 1
}, {
    unique: true
});

export default mongoose.model("EnergyUsage", energyUsageSchema);