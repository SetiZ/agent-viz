import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    spec: 'src/spec/index.ts',
    react: 'src/react/index.tsx',
    client: 'src/client/index.ts',
    agent: 'src/agent/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  external: ['react', 'react/jsx-runtime', 'react-dom'],
});
