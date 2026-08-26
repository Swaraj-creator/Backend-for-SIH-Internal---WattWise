import mongoose from "mongoose";

const PowerReading = new mongoose.Schema({
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

    appliances: [
        {
            applianceId: {
                type: String,
                required: true
            },

            name: {
                type: String,
                required: true
            },

            voltage: {
                type: Number,
                required: true
            },

            current: {
                type: Number,
                required: true
            },

            power: {
                type: Number,
                required: true
            }
        }
    ],

    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

PowerReading.index({
    deviceId: 1,
    slaveId: 1,
    timestamp: 1
}, {
    unique: true
});

export default mongoose.model("PowerReading", PowerReading);