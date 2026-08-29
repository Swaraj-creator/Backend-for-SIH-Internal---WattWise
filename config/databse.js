import mongoose from "mongoose";
const connectDB = async () => {
    const uri = process.env.MONGODB_URI || process.env.MONGODB_URL;

    if (!uri) {
        throw new Error("MONGODB_URI is required");
    }

    await mongoose.connect(uri);
    console.log("MongoDB connected");
};

export default connectDB;
