// Borra la base de desarrollo y los archivos subidos, y vuelve a cargar los datos de ejemplo.
//   npm run db:reset -w @parla/api
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const target of ['prisma/dev.db', 'prisma/dev.db-journal', 'storage']) {
  rmSync(join(apiDir, target), { recursive: true, force: true });
}
console.log('Base de desarrollo y archivos borrados.');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'db:setup'], {
  cwd: apiDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
