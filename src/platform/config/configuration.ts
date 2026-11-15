function setting(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export default function configFactory() {
  const isTest = process.env.NODE_ENV === 'test';
  return {
    app: {
      env: process.env.NODE_ENV ?? 'development',
      port: Number(process.env.PORT ?? 3001),
      timezone: process.env.TZ,
      frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    },
    throttle: {
      ttl: Number(process.env.THROTTLE_TTL ?? 60000),
      limit: Number(process.env.THROTTLE_LIMIT ?? (isTest ? 1000 : 100)),
      authLimit: Number(
        process.env.THROTTLE_AUTH_LIMIT ?? (isTest ? 1000 : 10),
      ),
    },
    database: {
      postgres: {
        url:
          process.env.DATABASE_URL ??
          'postgres://car-rental:car-rental@localhost:15432/car-rental',
        ssl: process.env.DATABASE_SSL === 'true',
      },
    },
    storage: {
      bucket: setting('MINIO_BUCKET', 'funch-assets'),
      endpoint: setting('MINIO_ENDPOINT', 'http://localhost:19000'),
      publicEndpoint: setting(
        'MINIO_PUBLIC_ENDPOINT',
        'http://localhost:19000',
      ),
      accessKey: setting('MINIO_ACCESS_KEY', 'funch-app'),
      secretKey: setting('MINIO_SECRET_KEY', 'funch-local-secret-change-this'),
    },
  };
}
