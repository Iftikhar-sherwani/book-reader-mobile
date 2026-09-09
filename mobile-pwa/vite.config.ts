import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base './' guarantees that the app works under any GitHub Pages subpath
// e.g. https://USERNAME.github.io/REPOSITORY/ or root domains without broken links
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
