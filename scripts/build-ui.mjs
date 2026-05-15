import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const srcDir = resolve(rootDir, 'src', 'ui');

const watchMode = process.argv.includes('--watch');

async function build() {
  const buildOptions = {
    entryPoints: [resolve(srcDir, 'app.ts')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    write: false,
  };

  if (watchMode) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('👀 Watching UI files for changes...');

    await ctx.rebuild().then(processBuildResult);
    process.on('SIGINT', async () => {
      await ctx.dispose();
      process.exit(0);
    });

    return;
  }

  const result = await esbuild.build({ ...buildOptions, write: false });
  processBuildResult(result);
}

function processBuildResult(result) {
  let jsContent = result.outputFiles[0].text;
  const htmlPath = resolve(srcDir, 'index.html');
  let htmlContent = readFileSync(htmlPath, 'utf-8');
  const cssPath = resolve(srcDir, 'styles.css');
  let cssContent = readFileSync(cssPath, 'utf-8');

  // Escape $ in JS to prevent String.replace interpreting $&, $', etc. as backreferences
  jsContent = jsContent.replace(/\$/g, '$$$$');

  // Replace by filename — robust against any HTML formatting
  htmlContent = htmlContent.replace(
    /<link\b[^>]*href="styles\.css"[^>]*\/?>/,
    `<style>${cssContent}</style>`
  );

  htmlContent = htmlContent.replace(
    /<script\b[^>]*src="app\.ts"[^>]*>\s*<\/script>/,
    `<script>${jsContent}</script>`
  );

  const outputPath = resolve(rootDir, 'ui.html');
  writeFileSync(outputPath, htmlContent);
  console.log(`✅ ui.html built successfully (${(Buffer.byteLength(htmlContent) / 1024).toFixed(1)} KB)`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
