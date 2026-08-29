export const notFound = (req, res) => res.status(404).json({ success: false, message: "Route not found" });

export const errorHandler = (err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    if (err?.name === "ValidationError" || err?.name === "CastError") {
        return res.status(400).json({ success: false, message: "Invalid request data" });
    }
    if (err?.code === 11000) return res.status(409).json({ success: false, message: "A record with that value already exists" });
    res.status(500).json({ success: false, message: "Internal server error" });
};
