import { defineConfig } from 'drizzle-kit';
import { config } from './src/config';

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: config.databaseUrl,
  },
});
