import { defineConfig } from 'vite';
export default defineConfig({
  envDir:'../..',
  server: { port: 5173, proxy: { '/ws': { target: 'ws://127.0.0.1:2567', ws: true }, '/health': 'http://127.0.0.1:2567' } },
  build: { target: 'es2022', sourcemap: true }
});
