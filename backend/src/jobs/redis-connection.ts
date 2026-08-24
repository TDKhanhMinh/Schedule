export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export function parseRedisConnection(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
  };
}
