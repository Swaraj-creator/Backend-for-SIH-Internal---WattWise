import crypto from "crypto";

export const generateDeviceToken = () => crypto.randomBytes(32).toString("hex");

export const hashDeviceToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
