import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tsConfigPaths()],
  optimizeDeps: {
    include: ['dayjs'],
  },
  build: {
    outDir: './client',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
    commonjsOptions: {
      include: [/node_modules/, /dayjs/],
    },
  },
}));
