import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:2712");

ws.on("open", () => {
    console.log("✅ WebSocket connected");
});

ws.on("message", (data) => {
    console.log("📡 Telemetry received:");
    console.log(JSON.parse(data.toString()));
});

ws.on("close", () => {
    console.log("❌ WebSocket disconnected");
});

ws.on("error", (error) => {
    console.error("❌ WebSocket error:", error);
});