import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    env: {
      DATABASE_URL: 'postgres://casemgmt:casemgmt@localhost:54329/casemgmt_test',
      APP_SECRET: 'test-secret-test-secret-test-secret',
      APP_BASE_URL: 'http://localhost:3000',
      SIMULATOR_ENABLED: 'true',
      BOT_RATE_LIMIT: '1000',
      LINE_CHANNEL_SECRET: 'test-channel-secret',
      LINE_CHANNEL_ACCESS_TOKEN: '',
    },
    fileParallelism: false,
  },
});
