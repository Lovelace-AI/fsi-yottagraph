import { getProject, listEntities, getAllScores } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const project = await getProject(id);
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

    const entities = await listEntities(id);
    const scores = await getAllScores(id);

    return { ...project, entities, scores };
});
