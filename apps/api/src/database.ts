import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export function database(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL is required');
  // Pin the session to UTC. On a server whose TimeZone is a local one, timestamptz
  // reads come back without their offset, so a JS Date is off by that offset and
  // lagosDate() derives the wrong business day — which breaks batch numbering for
  // the hour before Lagos midnight. Never rely on the server's configured zone.
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      connectionTimeoutMillis: 5000,
      options: '-c timezone=UTC',
    }),
  });
}
