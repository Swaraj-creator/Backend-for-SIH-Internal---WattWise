import mongoose from "mongoose";

const powerReadingSchema = new mongoose.Schema({
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
            _id: false,
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
        required: true,
        index: true
    }
});

powerReadingSchema.index({
    deviceId: 1,
    slaveId: 1,
    timestamp: 1
}, {
    unique: true
});

export default mongoose.model("PowerReading", powerReadingSchema);
