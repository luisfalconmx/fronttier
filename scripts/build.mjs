// Bundles every process of the app with esbuild into dist/.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dev = process.argv.includes('--dev');
const out = join(root, 'dist');
const require = createRequire(import.meta.url);

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'renderer'), { recursive: true });
mkdirSync(join(out, 'vendor'), { recursive: true });

const common = {
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  target: 'chrome140',
  logLevel: 'info',
  legalComments: 'none',
};

await Promise.all([
  build({
    ...common,
    entryPoints: [join(root, 'src/main/index.ts')],
    outfile: join(out, 'main.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'bufferutil', 'utf-8-validate'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/preload/shell.ts')],
    outfile: join(out, 'preload-shell.js'),
    platform: 'browser',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/preload/pane.ts')],
    outfile: join(out, 'preload-pane.js'),
    platform: 'browser',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/portal/client.ts')],
    outfile: join(out, 'portal-client.js'),
    platform: 'browser',
    format: 'iife',
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/renderer/main.ts')],
    outfile: join(out, 'renderer/app.js'),
    platform: 'browser',
    format: 'iife',
  }),
]);

cpSync(join(root, 'src/renderer/index.html'), join(out, 'renderer/index.html'));
cpSync(join(root, 'src/renderer/styles.css'), join(out, 'renderer/styles.css'));
cpSync(require.resolve('axe-core/axe.min.js'), join(out, 'vendor/axe.min.js'));
cpSync(require.resolve('axe-core/locales/es.json'), join(out, 'vendor/axe.es.json'));
// macOS: Location Services helper, a universal mini app compiled once into
// dist-native/ and reused until its sources change.
if (process.platform === 'darwin') {
  const src = join(root, 'native/macos');
  const cache = join(root, 'dist-native/FronttierLocation.app');
  const bin = join(cache, 'Contents/MacOS/locate');
  const newest = Math.max(...['locate.swift', 'Info.plist'].map((f) => statSync(join(src, f)).mtimeMs));
  try {
    if (!existsSync(bin) || statSync(bin).mtimeMs < newest) {
      rmSync(cache, { recursive: true, force: true });
      mkdirSync(join(cache, 'Contents/MacOS'), { recursive: true });
      cpSync(join(src, 'Info.plist'), join(cache, 'Contents/Info.plist'));
      const arches = ['arm64', 'x86_64'].map((arch) => {
        const o = `${bin}-${arch}`;
        execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos11`, join(src, 'locate.swift'), '-o', o], { stdio: 'inherit' });
        return o;
      });
      execFileSync('lipo', ['-create', ...arches, '-output', bin]);
      for (const o of arches) rmSync(o);
      execFileSync('codesign', ['--force', '--sign', '-', cache]);
    }
    cpSync(cache, join(out, 'native/FronttierLocation.app'), { recursive: true });
  } catch (e) {
    console.warn('No se pudo compilar el helper de ubicación (¿faltan las Xcode Command Line Tools?):', e.message);
  }
}

console.log('Build listo en dist/');
