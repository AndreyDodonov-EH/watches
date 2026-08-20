import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const basePath = process.env.BASE_PATH;

export default defineConfig({
  base: basePath ? `${basePath.replace(/\/$/, '')}/` : '/',
  resolve: { alias: { '@spec': fileURLToPath(new URL('../spec', import.meta.url)) } },
  server: { fs: { allow: ['..'] } },
});
