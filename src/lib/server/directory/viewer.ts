import type { Cookies } from '@sveltejs/kit';
import { isClosed, type DirectorySettings } from '#lib/directory/rules.ts';
import { PARTICIPANT_COOKIE, readParticipant } from '../ops/passes.ts';
import { getRegistration } from '../store.ts';
import { memberFlags, type MemberFlags } from './people.ts';
import { directoryReady, getDirectorySettings } from './settings.ts';

/** The signed-in delegate using the directory. */
export interface Member {
	id: string;
	code: string;
	fullName: string;
	designation: string;
	companyName: string;
	flags: MemberFlags;
}

export type Viewer =
	| { state: 'not-ready' }
	| { state: 'signed-out' }
	| { state: 'unpaid' }
	| { state: 'closed'; settings: DirectorySettings }
	| { state: 'open'; eventId: string; me: Member; settings: DirectorySettings };

/** Who is looking at the directory, and whether they may use it. */
export async function directoryViewer(cookies: Cookies): Promise<Viewer> {
	if (!(await directoryReady())) return { state: 'not-ready' };
	const session = await readParticipant(cookies.get(PARTICIPANT_COOKIE));
	if (!session) return { state: 'signed-out' };
	const [reg, settings, flags] = await Promise.all([
		getRegistration(session.registrationId),
		getDirectorySettings(),
		memberFlags(session.registrationId)
	]);
	if (!reg) return { state: 'signed-out' };
	if (reg.status !== 'paid') return { state: 'unpaid' };
	if (isClosed(new Date(), settings.closesAt)) return { state: 'closed', settings };
	return {
		state: 'open',
		eventId: session.eventId,
		me: { id: reg.id, code: reg.code, fullName: reg.fullName, designation: reg.designation, companyName: reg.companyName, flags },
		settings
	};
}

/**
 * Just the signed-in delegate, for the frequent poll: one query instead of the full
 * viewer check. A reissued pass still fails here.
 */
export async function directorySession(cookies: Cookies): Promise<{ registrationId: string; eventId: string } | null> {
	if (!(await directoryReady())) return null;
	return readParticipant(cookies.get(PARTICIPANT_COOKIE));
}
