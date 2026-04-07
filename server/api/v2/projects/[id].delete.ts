import { deleteProject } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const deleted = await deleteProject(id);
    if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Project not found' });

    return { success: true };
});
