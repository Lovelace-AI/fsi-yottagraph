import { listEntities, getAllScores } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const entities = await listEntities(id);
    const scores = await getAllScores(id);

    return entities.map((e) => {
        const score = scores.find((s) => s.neid === e.neid);
        return { ...e, score: score ?? null };
    });
});
