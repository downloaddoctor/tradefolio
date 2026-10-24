import { build, transform } from 'esbuild';
import { minify as minifyHtml } from 'html-minifier-terser';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const NL = String.fromCharCode(10);
const OUT = 'dist';

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT + '/css', { recursive: true });

// 1. bundle only our ES modules into one minified script (CDN libs stay as CDN scripts)
await build({
  entryPoints: ['src/js/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: OUT + '/app.js',
  legalComments: 'none',
  logLevel: 'info',
});

// 2. css: minified, still a separate file
const css = await readFile('src/css/style.css', 'utf8');
const minCss = await transform(css, { loader: 'css', minify: true, legalComments: 'none' });
await writeFile(OUT + '/css/style.css', minCss.code);

// 3. index.html: swap the module entry for the bundle, then minify (CDN tags untouched)
const html = await readFile('index.html', 'utf8');
const entry = '<script type=\'module\' src=\'./src/js/main.js\'></script>';
if (!html.includes(entry)) throw new Error('module script tag not found in index.html');
const minHtml = await minifyHtml(html.replaceAll('./assets/favicon.svg', './favicon.svg').replaceAll('./src/css/style.css', './css/style.css').replace(entry, '<script defer src=\'./app.js\'></script>'), {
  collapseWhitespace: true,
  conservativeCollapse: true,
  removeComments: true,
  minifyJS: true,
  minifyCSS: true,
});
await writeFile(OUT + '/index.html', minHtml);

// 4. static assets (manifest re-serialised without whitespace)
await writeFile(OUT + '/favicon.svg', await readFile('assets/favicon.svg'));
const manifest = JSON.parse(await readFile('manifest.webmanifest', 'utf8'));
await writeFile(OUT + '/manifest.webmanifest', JSON.stringify(manifest).replaceAll('./assets/favicon.svg', './favicon.svg'));

// 5. service worker: precache the bundle instead of js modules, unique cache name per build, minified
const sw = await readFile('sw.js', 'utf8');
const lines = sw.replaceAll('./assets/favicon.svg', './favicon.svg').replaceAll('./src/css/style.css', './css/style.css').split(NL).filter((l) => !l.includes('\'./src/js/'));
const swOut = lines.map((l) => {
  if (l.startsWith('const CACHE')) return 'const CACHE = \'tp-' + Date.now().toString(36) + '\';';
  if (l.trim() === '\'./css/style.css\'') return '  \'./app.js\',' + NL + l;
  return l;
});
const minSw = await transform(swOut.join(NL), { loader: 'js', minify: true, legalComments: 'none' });
await writeFile(OUT + '/sw.js', minSw.code);

// 6. GitHub Pages: skip Jekyll processing
await writeFile(OUT + '/.nojekyll', '');
console.log('dist ready');
