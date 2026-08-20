import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@spec': fileURLToPath(new URL('../spec', import.meta.url)) } },
  server: { fs: { allow: ['..'] } },
});
