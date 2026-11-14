// Copy the pipeline's published files (../app/data/) into public/data/ so Vite serves and bundles them.
// app/data/ stays the single source of truth; this folder is gitignored. Run by predev/prebuild.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..', '..', 'app', 'data');
const dst = resolve(here, '..', 'public', 'data');
if (!existsSync(src)) {
  console.error(`sync-data: ${src} not found. Run \`make build\` in the repo root first.`);
  process.exit(1);
}
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log(`sync-data: copied ${src} -> ${dst}`);
