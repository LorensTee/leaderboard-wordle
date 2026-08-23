import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'postgresql',
	schema: './src/server/db/schema.ts',
	out: './src/server/db/migrations',
	// Generation does not need credentials; migrate/push read DATABASE_URL
	// from the environment at CLI time.
	dbCredentials: {
		url: process.env.DATABASE_URL ?? ''
	},
	strict: true,
	verbose: true
});