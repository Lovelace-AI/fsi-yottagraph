import { createProject } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const body = await readBody<{ name: string; description?: string }>(event);
    if (!body?.name?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Project name is required' });
    }
    return await createProject(body.name.trim(), body.description?.trim() || '');
});
