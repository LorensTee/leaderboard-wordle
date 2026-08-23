// CI diagnostics for the integration job's Neon connection (Gate 3).
// Prints ONLY connection-string FACTS (scheme/host/sslmode-flag/pooler/length)
// and the pg driver's error — never the password or full URL.
import { Pool } from 'pg';

const url = process.env.DATABASE_URL ?? '';
if (!url) {
	console.error('DATABASE_URL is empty');
	process.exit(2);
}

function facts(u: string): string {
	const head = u.slice(0, u.indexOf('://') + 3);
	try {
		const parsed = new URL(u.replace(/^postgres(ql)?:\/\//, 'http://'));
		return [
			`scheme=${head}`,
			`host=${parsed.hostname}`,
			`sslmode=${parsed.searchParams.get('sslmode') ?? '(not set)'}`,
			`pooler=${parsed.hostname.includes('-pooler')}`,
			`urlLength=${u.length}`
		].join(' ');
	} catch {
		return `scheme=${head} (URL parse failed — malformed connection string)`;
	}
}

console.log(`probe: ${facts(url)}`);

const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
try {
	const { rows } = await pool.query('SELECT 1 AS ok');
	console.log(`connect OK: ${JSON.stringify(rows[0])}`);
} catch (e) {
	const err = e as Error & { code?: string };
	console.error(`connect FAILED code=${err.code ?? 'n/a'} message=${err.message.split('\n')[0]}`);
	process.exit(1);
} finally {
	await pool.end();
}