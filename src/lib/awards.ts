import { normalisePhone } from './registration.ts';

/** The awards are the Salem Entrepreneurs Forum's own event, separate from the conclave's schedule. */
export const AWARDS_EVENT = {
	name: 'Salem Entrepreneurs Awards',
	presenter: 'Salem Entrepreneurs Forum',
	date: 'Sat, 28 Nov 2026',
	time: '4 pm onwards',
	venue: 'Kongu SRV School Auditorium, Salem',
	phone: '9363536239',
	poster: '/poster/salem-entrepreneurs-awards.jpg'
} as const;

/** The award categories, in the organisers' order. "Others" lets applicants write their own. */
const CATEGORY_NAMES = [
	'Chartered Accountant (CA)',
	'Tax Consultant',
	'Company Secretary',
	'Auditor',
	'Financial Advisor',
	'Insurance Consultant',
	'Banking & Loan Consultant',
	'Legal Advisor / Advocate',
	'Business Consultant',
	'HR & Recruitment Consultant',
	'Real Estate Agent',
	'Property Developer / Builder',
	'Civil Contractor',
	'Architect',
	'Interior Designer',
	'Structural Engineer',
	'Building Materials Supplier',
	'Electrical Contractor',
	'Plumbing Contractor',
	'Modular Kitchen & Furniture',
	'Digital Marketing Agency',
	'Social Media Marketing',
	'Branding & Graphic Design',
	'Website Development',
	'Software Development',
	'IT Solutions & Networking',
	'AI & Automation Solutions',
	'Photography & Videography',
	'Printing & Advertising',
	'Event Management',
	'Textile & Garments',
	'Automobile Manufacturing',
	'Automobile Spare Parts',
	'Industrial Machinery',
	'Electrical & Electronics',
	'Food Manufacturing',
	'Packaging Industry',
	'Wholesale & Distribution',
	'Import & Export',
	'FMCG Products',
	'Jewellery & Gold',
	'Fashion & Boutique',
	'Beauty & Cosmetics',
	'Salon & Spa',
	'Furniture & Home Decor',
	'Mobile & Electronics Retail',
	'Supermarket & Grocery',
	'Gift & Customized Products',
	'Restaurant & Catering',
	'Bakery & Confectionery',
	'Hotels & Resorts',
	'Travel & Tourism',
	'Event Catering',
	'Cafe & Beverages',
	'Hospitals & Clinics',
	'Pharmaceuticals',
	'Dental Care',
	'Fitness & Wellness',
	'Educational Institutions',
	'Training & Skill Development',
	'Agriculture & Organic Farming',
	'Logistics & Transportation',
	'Courier Services',
	'Automobile Dealers',
	'Car Rentals',
	'Pest Control',
	'Security Services',
	'Housekeeping Services',
	'Solar Energy Solutions',
	'Water Treatment',
	'Waste Management',
	'NGO & Social Enterprises',
	'Business Coaching',
	'Insurance & Wealth Management',
	'Sports & Recreation'
] as const;

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const AWARD_CATEGORIES: { id: string; name: string }[] = [
	...CATEGORY_NAMES.map((name) => ({ id: slug(name), name })),
	{ id: 'others', name: 'Others (write your own)' }
];

/** The first list's categories, so applications already received keep a readable label. */
const EARLIER_CATEGORIES: Record<string, string> = {
	textiles: 'Textiles',
	steel: 'Steel',
	sago: 'Sago',
	technology: 'Technology',
	healthcare: 'Healthcare',
	infrastructure: 'Infrastructure',
	jewellery: 'Jewellery'
};

export type AwardCategoryId = string;

export const TEAM_SIZES = ['1–10', '11–50', '51–200', '200+'] as const;

export const AWARD_LIMITS = {
	fullName: 60,
	designation: 60,
	email: 120,
	city: 60,
	businessName: 100,
	otherCategory: 60,
	website: 200,
	about: 600,
	achievements: 1000
} as const;

export const MAX_LOGO_BYTES = 3 * 1024 * 1024;

export interface AwardApplicationInput {
	fullName: string;
	designation: string;
	email: string;
	phone: string;
	city: string;
	businessName: string;
	categoryId: string;
	otherCategory: string;
	yearStarted: string;
	teamSize: string;
	website: string;
	about: string;
	achievements: string;
	declared: boolean;
}

export type AwardField = keyof AwardApplicationInput;
export type AwardErrors = Partial<Record<AwardField, string>>;

export type AwardStatus = 'new' | 'shortlisted' | 'winner' | 'rejected';
export const AWARD_STATUSES: AwardStatus[] = ['new', 'shortlisted', 'winner', 'rejected'];
export const AWARD_STATUS_LABEL: Record<AwardStatus, string> = {
	new: 'New',
	shortlisted: 'Shortlisted',
	winner: 'Winner',
	rejected: 'Not selected'
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "www.acme.in" becomes "https://acme.in"-style link; anything that is not a web address is null. */
export function normaliseWebsite(raw: string): string | null {
	const value = raw.trim();
	if (!value) return null;
	try {
		const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
		if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return null;
		return url.toString().replace(/\/$/, '');
	} catch {
		return null;
	}
}

export function awardCategoryLabel(id: string, other: string | null | undefined) {
	if (id === 'others') return other?.trim() ? `Others: ${other.trim()}` : 'Others';
	return AWARD_CATEGORIES.find((c) => c.id === id)?.name ?? EARLIER_CATEGORIES[id] ?? id;
}

export function validateAwardApplication(input: AwardApplicationInput, thisYear = new Date().getFullYear()): AwardErrors {
	const errors: AwardErrors = {};
	const need = (key: AwardField, label: string, min: number, max: number) => {
		const length = String(input[key]).trim().length;
		if (length < min) errors[key] = label;
		else if (length > max) errors[key] = `Keep it under ${max} characters.`;
	};
	need('fullName', 'Enter your full name.', 2, AWARD_LIMITS.fullName);
	need('designation', 'Enter your designation.', 2, AWARD_LIMITS.designation);
	need('city', 'Enter your city.', 2, AWARD_LIMITS.city);
	need('businessName', 'Enter your business name.', 2, AWARD_LIMITS.businessName);
	need('about', 'Tell us what your business does.', 20, AWARD_LIMITS.about);
	need('achievements', 'Tell us why your business deserves this award.', 30, AWARD_LIMITS.achievements);

	const email = input.email.trim();
	if (!EMAIL.test(email) || email.length > AWARD_LIMITS.email) errors.email = 'Enter a valid email address.';
	if (!normalisePhone(input.phone)) errors.phone = 'Enter a 10-digit Indian mobile number.';

	if (!AWARD_CATEGORIES.some((c) => c.id === input.categoryId)) errors.categoryId = 'Choose your business category.';
	if (input.categoryId === 'others') need('otherCategory', 'Enter your business category.', 2, AWARD_LIMITS.otherCategory);

	const year = input.yearStarted.trim();
	if (!/^\d{4}$/.test(year) || Number(year) < 1850 || Number(year) > thisYear) errors.yearStarted = 'Enter the 4-digit year you started.';
	if (!TEAM_SIZES.includes(input.teamSize as (typeof TEAM_SIZES)[number])) errors.teamSize = 'Choose your team size.';

	if (input.website.trim()) {
		if (input.website.trim().length > AWARD_LIMITS.website) errors.website = `Keep it under ${AWARD_LIMITS.website} characters.`;
		else if (!normaliseWebsite(input.website)) errors.website = 'Enter a valid website, like www.yourbusiness.com.';
	}
	if (!input.declared) errors.declared = 'Please confirm the details are correct.';
	return errors;
}
