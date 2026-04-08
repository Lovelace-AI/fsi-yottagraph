import { updateProject } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{ name?: string; description?: string }>(event);
    const project = await updateProject(id, body);
    if (!project) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

    return project;
});
