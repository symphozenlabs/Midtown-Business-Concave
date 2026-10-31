import { categoryInfo } from '#lib/ops/categories.ts';
import { openDesk } from '#lib/server/ops/desk.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const desk = await openDesk(locals, params.category, url.searchParams.get('event'));
	const session = url.searchParams.get('session');
	const meal = url.searchParams.get('meal');
	return {
		desk,
		info: categoryInfo(desk.category),
		sessionId: desk.sessions.find((s) => s.id === session)?.id ?? desk.currentSessionId,
		mealId: desk.meals.find((m) => m.id === meal)?.id ?? desk.currentMealId
	};
};
