import { getImportSession } from '~/server/utils/projectStore';

function toClientSession(session: any) {
    const { rows: _rows, ...rest } = session;
    return rest;
}

export default defineEventHandler(async (event) => {
    const projectId = getRouterParam(event, 'id');
    const sessionId = getRouterParam(event, 'sessionId');
    if (!projectId || !sessionId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Project ID and session ID are required',
        });
    }

    const session = await getImportSession(projectId, sessionId);
    if (!session) {
        throw createError({ statusCode: 404, statusMessage: 'Import session not found' });
    }

    return { session: toClientSession(session) };
});
