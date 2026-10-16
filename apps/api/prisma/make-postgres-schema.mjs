// Genera prisma/schema.postgres.prisma a partir del esquema de desarrollo (SQLite).
// Uso en producción:
//   npm run db:postgres-schema -w @parla/api
//   DATABASE_URL=postgresql://... npx prisma db push --schema prisma/schema.postgres.prisma
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(dir, 'schema.prisma'), 'utf8');
const target = source.replace('provider = "sqlite"', 'provider = "postgresql"');
writeFileSync(join(dir, 'schema.postgres.prisma'), target);
console.log('prisma/schema.postgres.prisma generado (provider = postgresql)');
