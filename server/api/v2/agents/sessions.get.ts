import { listSessions } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const projectId = query.projectId as string;
    if (!projectId) {
        throw createError({ statusCode: 400, statusMessage: 'projectId query param required' });
    }
    return await listSessions(projectId);
});
