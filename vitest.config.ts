import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolve = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: /^react$/,
        replacement: resolve('./node_modules/react/index.js'),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: resolve('./node_modules/react/jsx-runtime.js'),
      },
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: resolve('./node_modules/react/jsx-dev-runtime.js'),
      },
      {
        find: /^react-dom$/,
        replacement: resolve('./node_modules/react-dom/index.js'),
      },
      {
        find: /^react-dom\/client$/,
        replacement: resolve('./node_modules/react-dom/client.js'),
      },
      {
        find: '@strapi/design-system',
        replacement: resolve(
          './packages/strapi-mcp-viz/node_modules/@strapi/design-system/dist/index.mjs',
        ),
      },
      {
        find: '@strapi/ui-primitives',
        replacement: resolve(
          './packages/strapi-mcp-viz/node_modules/@strapi/ui-primitives/dist/index.mjs',
        ),
      },
    ],
  },
  test: {
    include: ['packages/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'node',
    server: {
      deps: {
        inline: [
          '@strapi/design-system',
          '@strapi/ui-primitives',
          '@strapi/admin',
          '@strapi/icons',
          'lodash',
          /@radix-ui\//,
        ],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/**/*.test.ts', 'packages/core/src/**/index.ts'],
    },
  },
});
