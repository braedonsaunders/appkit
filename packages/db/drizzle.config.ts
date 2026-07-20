import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.APPKIT_DB_URL ?? 'postgres://postgres@localhost:5432/appkit' },
})
