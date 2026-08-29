import mongoose from "mongoose";

const motionReadingSchema = new mongoose.Schema({
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

    occupied: {
        type: Boolean,
        required: true
    },

    timestamp: {
        type: Date,
        required: true,
        index: true
    }
});

motionReadingSchema.index({
    deviceId: 1,
    slaveId: 1,
    timestamp: 1
}, {
    unique: true
});

export default mongoose.model("MotionReading", motionReadingSchema);
