import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

execSync(
  'zip -j cp-workflow.zip manifest.json code.js ui.html',
  { cwd: rootDir, stdio: 'inherit' }
);

console.log('✅ Packaged to cp-workflow.zip');
