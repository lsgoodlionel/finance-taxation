function positiveIntEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3100),
  appName: "finance-taxation-v2-api",
  accessTokenTtlMs: Number(process.env.ACCESS_TOKEN_TTL_MS || 8 * 60 * 60 * 1000),
  refreshTokenTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS || 7 * 24 * 60 * 60 * 1000),
  dbStartupMaxAttempts: Number(process.env.DB_STARTUP_MAX_ATTEMPTS || 12),
  dbStartupDelayMs: Number(process.env.DB_STARTUP_DELAY_MS || 2000),
  loginMaxFailedAttempts: positiveIntEnv(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 5),
  loginLockoutMs: positiveIntEnv(process.env.LOGIN_LOCKOUT_MS, 15 * 60 * 1000),
  // scrypt cost factor N (OWASP baseline 2^17 in production; the test stack
  // dials this down via LOGIN_SCRYPT_COST_N so login hashing stays cheap under
  // a CPU-constrained runner). Must be a power of two > 1.
  loginScryptCostN: positiveIntEnv(process.env.LOGIN_SCRYPT_COST_N, 131072),
  databaseUrl: process.env.DATABASE_URL || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://host.docker.internal:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "gemma4:latest"
};
