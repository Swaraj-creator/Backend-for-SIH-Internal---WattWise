import express from "express";
import dotenv from "dotenv";
import { WebSocketServer } from "ws";
import http from "http";
import helmet from "helmet";
import cors from "cors";

import connectDB from "./config/database.js";
import telemetryRouter from "./routes/telemetryRoutes.js";
import authRouter from "./routes/authRoutes.js";
import masterRouter from "./routes/masterRoutes.js";
import slaveRouter from "./routes/slaveRoutes.js";
import energyRouter from "./routes/energyRoutes.js";
import { setupTelemetrySocket } from "./websocket/telemetrySocket.js";
import { startDeviceStatusService } from "./services/deviceStatusService.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Server is running");
});

app.use("/api/telemetry", telemetryRouter);
app.use("/api/auth", authRouter);
app.use("/api/masters", masterRouter);
app.use("/api/slaves", slaveRouter);
app.use("/api/energy", energyRouter);
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);

const wss = new WebSocketServer({
    server
});

wss.on("error", (error) => {
    console.error("WebSocket server error:", error.message);
});

setupTelemetrySocket(wss);

server.on("error", (error) => {
    console.error("HTTP server error:", error.message);
});

connectDB().then(() => {
    startDeviceStatusService();
    
    server.listen(PORT, () => {
        console.log("Server running at port: " + PORT);
        console.log("WebSocket server running");
    });
}).catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exitCode = 1;
});
