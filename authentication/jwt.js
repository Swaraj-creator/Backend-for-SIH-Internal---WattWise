import jwt from 'jsonwebtoken';

export const generateToken = (payload) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is required");
    return jwt.sign(payload, secret, { expiresIn: process.env.JWT_EXPIRES_IN || "10d" });
};

export const verifyToken = (token) => {
    try {
        if (!process.env.JWT_SECRET) return null;
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};
