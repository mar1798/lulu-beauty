function makeConfig<T extends Record<string, unknown>>(
  config: T
): <K extends keyof T>(key: K) => T[K] {
  return key => config[key]
}

export const publicConfig = makeConfig({
  baseUrl: process.env.NEXT_PUBLIC_WP_BASE_URL ?? 'invalid_env_value',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'invalid_env_value',
} as const)

