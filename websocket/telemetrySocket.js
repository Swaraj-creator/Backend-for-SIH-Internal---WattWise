const clients = new Set();

export const setupTelemetrySocket = (wss) => {
    wss.on("connection", ws => {
        console.log("Frontend WebSocket connected");

        clients.add(ws);

        ws.on("message", message => {
            try {
                JSON.parse(message.toString());
            } catch {
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Malformed WebSocket message"
                }));
            }
        });

        ws.on("close", (code, reason) => {
            console.log(
                "Frontend WebSocket disconnected:",
                code,
                reason.toString()
            );

            clients.delete(ws);
        });

        ws.on("error", error => {
            console.error("WebSocket error:", error.message);
            clients.delete(ws);
        });
    });
};


export const broadcastTelemetry = data => {
    const message = JSON.stringify({
        type: "telemetry",
        data
    });

    for (const client of clients) {
        if (client.readyState === 1) {
            client.send(message, error => {
                if (error) {
                    clients.delete(client);
                }
            });
        }
    }
};