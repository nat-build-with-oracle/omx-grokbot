import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset URLs so the built app also loads under a Home Assistant
  // ingress prefix, where the origin root belongs to Home Assistant.
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
