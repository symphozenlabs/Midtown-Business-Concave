import { normalisePhone } from './registration.ts';

/** The award categories, plus "Others" with the applicant's own wording. */
export const AWARD_CATEGORIES = [
	{ id: 'textiles', name: 'Textiles', hint: 'Looms, dyeing & handloom exporters' },
	{ id: 'steel', name: 'Steel', hint: 'Rolling mills, fabrication & foundries' },
	{ id: 'sago', name: 'Sago', hint: 'Tapioca processors of the Sagoserve belt' },
	{ id: 'technology', name: 'Technology', hint: 'IT services, SaaS & digital studios' },
	{ id: 'healthcare', name: 'Healthcare', hint: 'Hospitals, diagnostics & pharma' },
	{ id: 'infrastructure', name: 'Infrastructure', hint: 'Builders, realty & logistics' },
	{ id: 'jewellery', name: 'Jewellery', hint: 'Gold & silver smiths, makers & showrooms' },
	{ id: 'others', name: 'Others', hint: 'Enter your own business category' }
] as const;

export type AwardCategoryId = (typeof AWARD_CATEGORIES)[number]['id'];

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
	return AWARD_CATEGORIES.find((c) => c.id === id)?.name ?? id;
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
