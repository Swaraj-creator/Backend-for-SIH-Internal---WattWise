import User from "../models/User.js";
import { comparePassword, hashPassword } from "../authentication/password.js";
import { generateToken } from "../authentication/jwt.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const safeUser = (user) => ({ id: user._id, name: user.name, email: user.email });
const error = (res, status, message) => res.status(status).json({ success: false, message });
const normaliseEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";

export const register = async (req, res, next) => {
    try {
        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const email = normaliseEmail(req.body.email);
        const { password } = req.body;
        if (!name || !emailPattern.test(email) || typeof password !== "string" || password.length < 8) {
            return error(res, 400, "Provide a name, a valid email, and a password of at least 8 characters");
        }
        if (await User.exists({ email })) return error(res, 409, "User already exists");
        const user = await User.create({ name, email, password: await hashPassword(password) });
        res.status(201).json({ success: true, data: { user: safeUser(user), token: generateToken({ userId: user._id.toString() }) } });
    } catch (err) { next(err); }
};

export const login = async (req, res, next) => {
    try {
        const email = normaliseEmail(req.body.email);
        const { password } = req.body;
        if (!email || typeof password !== "string") return error(res, 400, "Email and password are required");
        const user = await User.findOne({ email });
        if (!user || !(await comparePassword(password, user.password))) return error(res, 401, "Invalid email or password");
        res.json({ success: true, data: { user: safeUser(user), token: generateToken({ userId: user._id.toString() }) } });
    } catch (err) { next(err); }
};

export const getCurrentUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId).select("-password");
        if (!user) return error(res, 404, "User not found");
        res.json({ success: true, data: user });
    } catch (err) { next(err); }
};
