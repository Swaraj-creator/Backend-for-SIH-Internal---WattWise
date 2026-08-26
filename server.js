import express from "express";
import { configDotenv } from "dotenv";
import { WebSocketServer } from "ws";
import http from "http";

import connectDB from "./config/databse.js";
import telemetryRouter from "./routes/telemetryRoutes.js";
import authRouter from "./routes/authRoutes.js";
import masterRouter from "./routes/masterRoutes.js";
import slaveRouter from "./routes/slaveRoutes.js";
import { setupTelemetrySocket } from "./websocket/telemetrySocket.js";
import { startDeviceStatusService } from "./services/deviceStatusService.js";

configDotenv({
    path: ".env"
});

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Server is running");
});

app.use("/api/telemetry", telemetryRouter);
app.use("/api/auth", authRouter);
app.use("/api/masters", masterRouter);
app.use("/api/slaves", slaveRouter);

const server = http.createServer(app);

const wss = new WebSocketServer({
    server
});

setupTelemetrySocket(wss);

connectDB().then(() => {
    startDeviceStatusService();
    
    server.listen(PORT, () => {
        console.log("Server running at port: " + PORT);
        console.log("WebSocket server running");
    });
});