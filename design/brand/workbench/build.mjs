import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const inkscape = process.env.INKSCAPE ?? (process.platform === 'win32'
  ? 'C:/Program Files/Inkscape/bin/inkscape.exe' : 'inkscape');
const palette = {
  graphite: '#151618', porcelain: '#f5f5f7', indigo: '#4f46e5',
  lilac: '#7f7eff', ink: '#17181c', white: '#ededef',
  passing: '#5cc98f', pending: '#e5b454', failing: '#f0616d',
};
const geometry = '<rect x="4" y="4" width="6" height="24" rx="1.5"/><path d="M14.5 4H22a6 6 0 0 1 6 6v1a4 4 0 0 1-4 4H14.5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 14.5 4ZM14.5 17H24a4 4 0 0 1 4 4v1a6 6 0 0 1-6 6h-7.5a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5Z"/>';
const mark = (color, transform = '') => `<g fill="${color}"${transform ? ` transform="${transform}"` : ''}>${geometry}</g>`;
const svg = (body, width = 32, height = width) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>\n`;
const save = (name, content) => {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
};
const raster = (source, name, size) => {
  const target = join(root, name);
  mkdirSync(dirname(target), { recursive: true });
  execFileSync(inkscape, [source, '--export-type=png', `--export-filename=${target}`,
    `--export-width=${size}`, '--export-background-opacity=0'], { stdio: 'pipe' });
  return readFileSync(target);
};

const app = save('app-icon.svg', svg(
  `<rect x="1" y="1" width="30" height="30" rx="7" fill="${palette.graphite}" stroke="#3f4046" stroke-width=".4"/>`
  + mark(palette.lilac, 'translate(4 4) scale(.75)')));
const appSizes = [16, 20, 24, 32, 48, 64, 128, 256, 512, 1024];
const pngs = new Map(appSizes.map(size => [size, raster(app, `app/icon-${size}.png`, size)]));

const icoSizes = [16, 20, 24, 32, 48, 64, 128, 256];
const icoHeader = Buffer.alloc(6 + icoSizes.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(icoSizes.length, 4);
let offset = icoHeader.length;
icoSizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  icoHeader[entry] = icoHeader[entry + 1] = size === 256 ? 0 : size;
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(pngs.get(size).length, entry + 8);
  icoHeader.writeUInt32LE(offset, entry + 12);
  offset += pngs.get(size).length;
});
save('app/icon.ico', Buffer.concat([icoHeader, ...icoSizes.map(size => pngs.get(size))]));
const icnsChunks = [[128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
  const data = pngs.get(size);
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(8 + data.length, 4);
  return Buffer.concat([header, data]);
});
const icnsHeader = Buffer.alloc(8);
icnsHeader.write('icns');
icnsHeader.writeUInt32BE(8 + icnsChunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
save('app/icon.icns', Buffer.concat([icnsHeader, ...icnsChunks]));

for (const [name, color] of Object.entries({
  light: palette.indigo, dark: palette.lilac, black: palette.ink, white: palette.white,
})) {
  const source = save(`mark-${name}.svg`, svg(mark(color)));
  raster(source, `mark-${name}.png`, 512);
}
save('mark-current-color.svg', svg(mark('currentColor')));
save('favicon.svg', svg(`<style>.brand{fill:${palette.indigo}}@media(prefers-color-scheme:dark){.brand{fill:${palette.lilac}}}</style><g class="brand">${geometry}</g>`));
for (const theme of ['light', 'dark']) {
  const color = theme === 'dark' ? palette.white : palette.ink;
  const accent = theme === 'dark' ? palette.lilac : palette.indigo;
  save(`wordmark-${theme}.svg`, svg(mark(accent) + `<text x="42" y="25" fill="${color}" font-family="Inter,Segoe UI,sans-serif" font-size="26" font-weight="600" letter-spacing="-.8">BorgDock</text>`, 180, 32));
  const source = save(`tray/on-${theme}.svg`, svg(mark(color)));
  for (const size of [16, 20, 24, 32, 64]) raster(source, `tray/on-${theme}-${size}.png`, size);
}
for (const state of ['idle', 'passing', 'pending', 'failing']) {
  const color = state === 'idle' ? palette.lilac : palette[state];
  const source = save(`tray/${state}.svg`, svg(`<rect x="1" y="1" width="30" height="30" rx="7" fill="${color}"/>` + mark('#12121a', 'translate(2 2) scale(.875)')));
  for (const size of [16, 20, 24, 32, 64]) raster(source, `tray/${state}-${size}.png`, size);
}

if (process.argv.includes('--install-app')) {
  const appRoot = join(root, '../../../src/BorgDock.Tauri');
  const copies = {
    'app-icon.svg': 'src-tauri/icons/icon.svg',
    'app/icon-32.png': 'src-tauri/icons/32x32.png',
    'app/icon-128.png': 'src-tauri/icons/128x128.png',
    'app/icon-256.png': 'src-tauri/icons/128x128@2x.png',
    'app/icon-512.png': 'src-tauri/icons/icon.png',
    'app/icon.ico': 'src-tauri/icons/icon.ico',
    'app/icon.icns': 'src-tauri/icons/icon.icns',
    'tray/on-light-64.png': 'src-tauri/icons/tray-dark.png',
    'tray/on-dark-64.png': 'src-tauri/icons/tray-light.png',
    'tray/on-dark-24.png': 'src-tauri/icons/tray-mark-small.png',
    'favicon.svg': 'public/borgdock-favicon.svg',
  };
  for (const [source, target] of Object.entries(copies)) {
    copyFileSync(join(root, source), join(appRoot, target));
  }
  copyFileSync(app, join(appRoot, 'public/borgdock-icon.svg'));
}

console.log('Built SVG, PNG, ICO and ICNS assets.');
