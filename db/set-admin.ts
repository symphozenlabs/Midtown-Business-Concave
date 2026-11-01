// Adds an organiser account for /admin, or resets its password (which signs out its sessions).
// Usage: node --env-file=.env db/set-admin.ts <email> <password>
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../src/lib/server/crypto.ts';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
	console.error('Usage: node --env-file=.env db/set-admin.ts <email> <password>');
	process.exit(1);
}
if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set.');
	process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const hash = await hashPassword(password);
const updated = await sql`
	update admin_users set password_hash = ${hash}, updated_at = now() where lower(email) = lower(${email}) returning email`;
if (updated.length) {
	console.log(`Reset the password for ${updated[0].email}.`);
} else {
	await sql`insert into admin_users (email, password_hash) values (${email.trim()}, ${hash})`;
	console.log(`Added ${email.trim()}.`);
}
