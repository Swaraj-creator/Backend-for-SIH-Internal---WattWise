import mongoose from "mongoose";
import { configDotenv } from "dotenv";

configDotenv({
    path: "../.env"
})

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URL);

        console.log("MongoDB connected");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
};

export default connectDB;