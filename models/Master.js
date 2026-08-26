import mongoose from "mongoose";

const Master = new mongoose.Schema({
    masterId: {
        type: String,
        required: true,
        unique: true,
        index: true
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

export default mongoose.model("Master", Master);