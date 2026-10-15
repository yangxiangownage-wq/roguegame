import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const CHAR_DIR = resolve(__dirname, 'public/assets/chars');
const CHAR_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function listCharArt(): Array<{ name: string; src: string; version: number }> {
  if (!existsSync(CHAR_DIR)) return [];
  return readdirSync(CHAR_DIR)
    .filter((name) => CHAR_EXT.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name: name.replace(/\.[^.]+$/, ''),
      src: `/assets/chars/${name}`,
      version: Math.round(statSync(join(CHAR_DIR, name)).mtimeMs),
    }));
}

function charArtPlugin(): Plugin {
  const id = 'virtual:char-art';
  const resolved = `\0${id}`;
  return {
    name: 'char-art',
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(source) {
      if (source !== resolved) return;
      return `export const CHAR_ART = ${JSON.stringify(listCharArt())};`;
    },
    configureServer(server) {
      const reload = (file: string) => {
        if (!file.replaceAll('\\', '/').includes('/public/assets/chars/')) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) void server.reloadModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(CHAR_DIR);
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
      server.watcher.on('change', reload);
    },
  };
}

export default defineConfig({
  plugins: [charArtPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        card: resolve(__dirname, 'card.html'),
      },
    },
  },
});

