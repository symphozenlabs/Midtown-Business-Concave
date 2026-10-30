/** Payment details the delegate pays to; the admin can change these from the dashboard. */
export interface PaymentSettings {
	priceRupees: number;
	/** UPI ID (virtual payment address), e.g. name@oksbi */
	vpa: string;
	payeeName: string;
}

/** Defaults, taken from the organiser's Google Pay QR. */
export const DEFAULT_PAYMENT: PaymentSettings = {
	priceRupees: 500,
	vpa: 'gmouly1@oksbi',
	payeeName: 'MOULISHWAR G'
};

export const MIN_PRICE = 1;
export const MAX_PRICE = 100000;

const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/;

export function isValidVpa(vpa: string) {
	return VPA.test(vpa.trim());
}

/**
 * UPI deep link (NPCI "upi://pay" format). Scanned as a QR or opened on a phone,
 * it pre-fills the payee, the exact amount and a note carrying the registration
 * number, so each payment can be matched to its registration.
 */
export function upiLink(settings: PaymentSettings, amountRupees: number, code: string) {
	const params = new URLSearchParams({
		pa: settings.vpa.trim(),
		pn: settings.payeeName.trim(),
		am: amountRupees.toFixed(2),
		cu: 'INR',
		tn: `${code} Midtown Business Conclave`
	});
	// URLSearchParams encodes spaces as "+", which some UPI apps show literally.
	return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

/** UPI transaction IDs (UTR / UPI Ref No.) are 12 digits. */
export function normaliseUtr(raw: string): string | null {
	const digits = raw.replace(/\s+/g, '');
	return /^\d{12}$/.test(digits) ? digits : null;
}

export function formatRupees(amount: number) {
	return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
