import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(import.meta.dirname, 'index.html'),
          about: path.resolve(import.meta.dirname, 'about.html'),
          centralKitchen: path.resolve(import.meta.dirname, 'central-kitchen.html'),
          hotels: path.resolve(import.meta.dirname, 'hotels.html'),
          hospitality: path.resolve(import.meta.dirname, 'hospitality.html'),
          residential: path.resolve(import.meta.dirname, 'residential.html'),
          showcase: path.resolve(import.meta.dirname, 'showcase.html'),
          privacy: path.resolve(import.meta.dirname, 'privacy.html'),
          page404: path.resolve(import.meta.dirname, '404.html'),
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
