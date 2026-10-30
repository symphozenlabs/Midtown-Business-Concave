export type Interest = 'networking' | 'private-meetings' | 'workshops' | 'b2b-stalls' | 'branding';

export interface RegistrationDraft {
	fullName: string;
	email: string;
	phone: string;
	companyName: string;
	designation: string;
	industry: string;
	industryOther: string;
	/** What the company does, in a line: shown to organisers for introductions. */
	about: string;
	website: string;
	city: string;
	cityOther: string;
	interests: Interest[];
	heardFrom: string;
	consent: boolean;
	whatsappUpdates: boolean;
}

export function emptyDraft(): RegistrationDraft {
	return {
		fullName: '',
		email: '',
		phone: '',
		companyName: '',
		designation: '',
		industry: '',
		industryOther: '',
		about: '',
		website: '',
		city: '',
		cityOther: '',
		interests: [],
		heardFrom: '',
		consent: false,
		whatsappUpdates: true
	};
}

export const INDUSTRIES = [
	'Manufacturing',
	'Textiles and garments',
	'Steel and metals',
	'Sago and food processing',
	'IT and software',
	'Healthcare',
	'Construction and real estate',
	'Retail and trading',
	'Professional services',
	'Education',
	'Logistics',
	'Other'
] as const;

export const INTERESTS: { value: Interest; label: string; description: string }[] = [
	{
		value: 'networking',
		label: 'Networking meet',
		description: 'Meet founders and business owners from across Tamil Nadu.'
	},
	{
		value: 'private-meetings',
		label: 'Private meeting zone',
		description: 'A quieter space for one-to-one business conversations.'
	},
	{
		value: 'workshops',
		label: 'Workshops',
		description: 'Practical sessions on running and growing a business.'
	},
	{
		value: 'b2b-stalls',
		label: 'B2B stalls',
		description: 'Explore the stalls, or ask us about showcasing your business.'
	},
	{
		value: 'branding',
		label: 'Branding',
		description: 'Ask us about brand visibility and sponsorship at the conclave.'
	}
];

export const HEARD_FROM = [
	'Salem Entrepreneurs Forum',
	'Coimbatore Entrepreneurs Forum',
	'Midtown Events',
	'WhatsApp',
	'Social media',
	'A friend or colleague',
	'Other'
] as const;

export const OTHER_CITY = 'Other';

/** Name-plate limits match the approved poster maker so every value fits the artwork. */
export const LIMITS = {
	fullName: 40,
	designation: 40,
	companyName: 44,
	industry: 36,
	about: 200,
	email: 120,
	website: 200,
	city: 60
} as const;

export type FieldKey = keyof RegistrationDraft | 'photo';

export interface Step {
	id: string;
	label: string;
	title: string;
	intro: string;
	fields: FieldKey[];
}

export const STEPS: Step[] = [
	{
		id: 'you',
		label: 'You',
		title: 'Tell us who is coming',
		intro: 'Your name and photo appear on your “I am attending” poster.',
		fields: ['fullName', 'email', 'phone', 'photo']
	},
	{
		id: 'business',
		label: 'Business',
		title: 'Your business',
		intro: 'This helps us introduce you to the right people on the day.',
		fields: ['companyName', 'designation', 'industry', 'industryOther', 'about', 'website']
	},
	{
		id: 'day',
		label: 'Your day',
		title: 'Plan your day',
		intro: 'Tell us where you are coming from and what you would like to make time for.',
		fields: ['city', 'cityOther', 'interests', 'heardFrom', 'consent']
	},
	{
		id: 'review',
		label: 'Review',
		title: 'Check your details',
		intro: 'Make any changes now. Next, you pay by UPI to confirm your seat.',
		fields: []
	},
	{
		id: 'payment',
		label: 'Payment',
		title: 'Pay to confirm your seat',
		intro: 'Scan the QR with any UPI app, then enter the transaction ID from your receipt.',
		fields: []
	}
];

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DOMAIN = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;

/** Returns +91XXXXXXXXXX for a valid Indian mobile number, otherwise null. */
export function normalisePhone(raw: string): string | null {
	const digits = raw.replace(/\D/g, '');
	const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
	return /^[6-9]\d{9}$/.test(local) ? `+91${local}` : null;
}

/** Formats as you type: 98427 88990. */
export function formatPhone(raw: string): string {
	const digits = raw.replace(/\D/g, '').replace(/^(91|0)(?=\d{10})/, '').slice(0, 10);
	return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

export function normaliseWebsite(raw: string): string {
	const value = raw.trim();
	if (!value) return '';
	return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function resolvedCity(d: RegistrationDraft): string {
	return d.city === OTHER_CITY ? d.cityOther.trim() : d.city;
}

export function resolvedIndustry(d: RegistrationDraft): string {
	return d.industry === 'Other' ? d.industryOther.trim() : d.industry;
}

export function validateField(key: FieldKey, d: RegistrationDraft, hasPhoto: boolean): string | null {
	switch (key) {
		case 'fullName': {
			const v = d.fullName.trim();
			if (!v) return 'Enter your full name.';
			if (v.length < 2) return 'Enter at least 2 characters.';
			if (v.length > LIMITS.fullName) return `Keep your name to ${LIMITS.fullName} characters so it fits your poster.`;
			return null;
		}
		case 'email': {
			const v = d.email.trim();
			if (!v) return 'Enter your email address.';
			if (!EMAIL.test(v) || v.length > LIMITS.email) return 'Enter an email address like name@company.com.';
			return null;
		}
		case 'phone':
			if (!d.phone.trim()) return 'Enter your mobile number.';
			if (!normalisePhone(d.phone)) return 'Enter a 10-digit Indian mobile number.';
			return null;
		case 'photo':
			return hasPhoto ? null : 'Add a photo for your poster.';
		case 'companyName': {
			const v = d.companyName.trim();
			if (!v) return 'Enter your company name.';
			if (v.length < 2) return 'Enter at least 2 characters.';
			if (v.length > LIMITS.companyName) return `Keep this to ${LIMITS.companyName} characters so it fits your poster.`;
			return null;
		}
		case 'designation': {
			const v = d.designation.trim();
			if (!v) return 'Enter your designation.';
			if (v.length < 2) return 'Enter at least 2 characters.';
			if (v.length > LIMITS.designation) return `Keep this to ${LIMITS.designation} characters so it fits your poster.`;
			return null;
		}
		case 'industry':
			return d.industry ? null : 'Choose your industry.';
		case 'industryOther':
			if (d.industry !== 'Other') return null;
			if (d.industryOther.trim().length < 2) return 'Tell us your industry.';
			return d.industryOther.trim().length > LIMITS.industry
				? `Keep this to ${LIMITS.industry} characters so it fits your poster.`
				: null;
		case 'about':
			return d.about.trim().length > LIMITS.about ? `Keep this under ${LIMITS.about} characters.` : null;
		case 'website': {
			const v = d.website.trim();
			if (!v) return null;
			if (!DOMAIN.test(v) || v.length > LIMITS.website) return 'Enter a web address like yourcompany.com.';
			return null;
		}
		case 'city':
			return d.city ? null : 'Choose the city you are travelling from.';
		case 'cityOther':
			if (d.city !== OTHER_CITY) return null;
			if (d.cityOther.trim().length < 2) return 'Enter your city.';
			return d.cityOther.trim().length > LIMITS.city ? `Keep this under ${LIMITS.city} characters.` : null;
		case 'interests':
			return d.interests.length ? null : 'Choose at least one.';
		case 'consent':
			return d.consent ? null : 'Agree to this so the organisers can confirm your place.';
		default:
			return null;
	}
}

export function validateStep(index: number, d: RegistrationDraft, hasPhoto: boolean) {
	const errors: Partial<Record<FieldKey, string>> = {};
	for (const key of STEPS[index].fields) {
		const message = validateField(key, d, hasPhoto);
		if (message) errors[key] = message;
	}
	return errors;
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (!parts.length) return '';
	const first = parts[0][0];
	const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
	return (first + last).toUpperCase();
}
