import bcrypt from "bcryptjs";

const getSaltRounds = () => {
    const rounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
    return Number.isInteger(rounds) && rounds >= 10 && rounds <= 15 ? rounds : 12;
};

export const hashPassword = async password => {
    return bcrypt.hash(password, getSaltRounds());
};

export const comparePassword = async (password, hash) => {
    return await bcrypt.compare(password, hash);
};
