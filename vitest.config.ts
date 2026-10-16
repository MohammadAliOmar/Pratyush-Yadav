import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
  // The unit tests exercise the local (browser-only) engine; shared mode is tested end to end separately
  define: {
    'import.meta.env.VITE_SHARED_MODE': JSON.stringify('false'),
  },
  resolve: {
    alias: {
      '@': path.resolve('.'),
    },
  },
});
