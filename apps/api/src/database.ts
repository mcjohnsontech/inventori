import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export function database(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL is required');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5000 }) });
}
