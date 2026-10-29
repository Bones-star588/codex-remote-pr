export const historyConfig = {
  // A healthy public download can outlast the old six-second first attempt.
  readTimeoutMs: 15000,
  navigationCacheMs: 30000,
  navigationCacheWindows: 5
} as const;
