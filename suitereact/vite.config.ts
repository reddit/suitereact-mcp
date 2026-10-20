import { copyFileSync } from 'fs';
import { resolve } from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import tsConfigPaths from 'vite-tsconfig-paths';
import * as packageJson from './package.json';
// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [
    dts({
      bundleTypes: true,
      afterBuild() {
        copyFileSync(resolve('dist/index.d.ts'), resolve('dist/index.d.cts'));
      },
      include: [
        'src/',
        'src/components/',
        'src/actions/',
        'src/domain/',
        'src/utils/',
      ],
    }),
    react(),
    tsConfigPaths(),
  ],
  optimizeDeps: {
    include: ['react/jsx-runtime'],
  },
  build: {
    lib: {
      entry: resolve('src', 'index.tsx'),
      name: 'suitereact',
      formats: ['es', 'umd'],
      fileName: format =>
        format === 'umd' ? 'suitereact.umd.cjs' : 'suitereact.es.js',
    },
    rollupOptions: {
      external: [...Object.keys(packageJson.peerDependencies || {})],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
}));
