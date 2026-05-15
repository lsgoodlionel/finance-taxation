export const env = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3100),
  appName: "finance-taxation-v2-api",
  accessTokenTtlMs: Number(process.env.ACCESS_TOKEN_TTL_MS || 8 * 60 * 60 * 1000),
  refreshTokenTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  databaseUrl: process.env.DATABASE_URL || null
};
