import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120, // 120 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25, // 25 per 15 min
  standardHeaders: true,
  legacyHeaders: false,
});

export const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10, // 10 submits/min per IP (still blocked by locking anyway)
  standardHeaders: true,
  legacyHeaders: false,
});
