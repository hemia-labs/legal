export function resolveEnvFilePath(environment = process.env.NODE_ENV) {
  return environment === 'production' || environment === 'test'
    ? []
    : ['.env', '.env.local'];
}

export const envFilePath = resolveEnvFilePath();
