import mongoose from "mongoose";

const masterSchema = new mongoose.Schema({
    masterId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
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
}, { timestamps: true });

export default mongoose.model("Master", masterSchema);
