import * as esbuild from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src', 'sandbox');

const watchMode = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [resolve(srcDir, 'main.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  outfile: resolve(rootDir, 'code.js'),
};

async function build() {
  if (watchMode) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching sandbox files for changes...');
    process.on('SIGINT', async () => {
      await ctx.dispose();
      process.exit(0);
    });
    return;
  }

  await esbuild.build(buildOptions);
  console.log('✅ code.js built successfully');
}

build().catch((err) => {
  console.error('Sandbox build failed:', err);
  process.exit(1);
});
