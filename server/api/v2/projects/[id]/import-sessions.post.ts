import {
    type ImportSession,
    saveImportSession,
    type ProjectEntity,
    type ImportSessionRow,
} from '~/server/utils/projectStore';
import { createImportSessionId, emitImportPipelineEvent } from '~/server/utils/watchlistImport';

function toClientSession(session: ImportSession) {
    const { rows: _rows, ...rest } = session;
    return rest;
}

export default defineEventHandler(async (event) => {
    const projectId = getRouterParam(event, 'id');
    if (!projectId) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{
        rows?: ImportSessionRow[];
        sourceType?: ProjectEntity['sourceType'];
        batchSize?: number;
    }>(event);

    if (!body?.rows?.length) {
        throw createError({ statusCode: 400, statusMessage: 'Import rows are required' });
    }

    const batchSize = Math.max(1, Math.min(body.batchSize || 2, 10));
    const sessionId = createImportSessionId();
    const session: ImportSession = {
        id: sessionId,
        projectId,
        sourceType: body.sourceType || 'csv',
        status: 'pending',
        totalRows: body.rows.length,
        processedRows: 0,
        batchSize,
        rows: body.rows,
        addedEntities: 0,
        resolvedEntities: 0,
        conflictFlags: 0,
        instrumentsWithHistory: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    await saveImportSession(projectId, session);
    emitImportPipelineEvent(
        session.id,
        'Queued watchlist import session',
        `${session.totalRows} rows queued in batches of ${session.batchSize}`
    );

    return { session: toClientSession(session) };
});
