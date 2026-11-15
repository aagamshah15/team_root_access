// Copy the pipeline's published files (../data/published/) into public/data/ so Vite serves and bundles them.
// data/published/ stays the single source of truth; this folder is gitignored. Run by predev/prebuild.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..', '..', 'data', 'published');
const dst = resolve(here, '..', 'public', 'data');
if (!existsSync(src)) {
  console.error(`sync-data: ${src} not found. Run \`make build\` in the repo root first.`);
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
cpSync(resolve(src, '../inputs/plants.csv'), resolve(dst, 'plants.csv'));
console.log(`sync-data: copied ${src} -> ${dst}`);
