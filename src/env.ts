import { defineEnvVars } from '@sveltejs/kit/env';

// All optional so `npm run dev` starts without credentials; the register
// endpoint simulates in development and refuses in production until set.
const optional = (value: string | undefined) => value?.trim() || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: {
		schema: optional,
		description: 'Neon Postgres connection string (Neon console → Connect), e.g. postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require'
	},
	R2_S3_API_URL: {
		schema: optional,
		description:
			'The bucket\'s S3 API URL (R2 → bucket → Settings → S3 API), e.g. https://<account-id>.r2.cloudflarestorage.com/mbc-2026'
	},
	R2_ACCESS_KEY_ID: {
		schema: optional,
		description: 'R2 API token access key ID with Object Read & Write on the bucket'
	},
	R2_SECRET_ACCESS_KEY: {
		schema: optional,
		description: 'R2 API token secret access key'
	},
	ADMIN_EMAIL: {
		schema: optional,
		description: 'Email address used to sign in to /admin'
	},
	ADMIN_PASSWORD: {
		schema: optional,
		description: 'Password for /admin (use a long, unique one). Changing it signs out every session.'
	},
	RESEND_API_KEY: {
		schema: optional,
		description: 'Resend API key (resend.com → API Keys) for sending tickets'
	},
	EMAIL_FROM: {
		schema: optional,
		description: 'Sender on a domain verified in Resend, e.g. Midtown Business Conclave <tickets@yourdomain.com>'
	},
	PASS_SECRET: {
		schema: optional,
		description:
			'Long random secret that signs every participant QR pass and "My pass" link (e.g. `openssl rand -base64 48`). Set once and never change it: a new secret makes every issued QR unreadable until passes are reissued.'
	}
});
