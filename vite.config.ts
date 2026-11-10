/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Production pages may not talk to any server: no fetch/XHR/WebSocket, no external resources.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "worker-src 'self'",
  "connect-src 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const strictCsp = (): Plugin => ({
  name: 'strict-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' },
  ],
});

export default defineConfig({
  base: './',
  plugins: [react(), strictCsp()],
  worker: { format: 'es' },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
