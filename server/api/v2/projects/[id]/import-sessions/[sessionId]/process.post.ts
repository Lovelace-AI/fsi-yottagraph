import { getImportSession, saveImportSession } from '~/server/utils/projectStore';
import {
    processWatchlistImportBatch,
    emitImportPipelineEvent,
} from '~/server/utils/watchlistImport';

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

    if (session.status === 'complete' || session.status === 'error') {
        return { session: toClientSession(session) };
    }

    const start = session.processedRows;
    const end = Math.min(session.totalRows, start + session.batchSize);
    const batch = session.rows.slice(start, end);
    if (batch.length === 0) {
        session.status = 'complete';
        session.completedAt = new Date().toISOString();
        session.updatedAt = session.completedAt;
        await saveImportSession(projectId, session);
        return { session: toClientSession(session) };
    }

    session.status = 'running';
    session.updatedAt = new Date().toISOString();
    session.lastDetail = `Processing rows ${start + 1}-${end} of ${session.totalRows}`;
    await saveImportSession(projectId, session);
    emitImportPipelineEvent(session.id, 'Processing watchlist batch', session.lastDetail, {
        processedRows: session.processedRows,
        totalRows: session.totalRows,
    });

    try {
        const result = await processWatchlistImportBatch({
            projectId,
            batch,
            sourceType: session.sourceType,
            importSessionId: session.id,
        });

        session.processedRows = end;
        session.addedEntities += result.added;
        session.resolvedEntities += result.resolved;
        session.conflictFlags += result.conflictFlags;
        session.instrumentsWithHistory += result.instrumentsWithHistory;
        session.updatedAt = new Date().toISOString();
        session.lastDetail = `Processed rows ${start + 1}-${end} of ${session.totalRows}`;

        if (session.processedRows >= session.totalRows) {
            session.status = 'complete';
            session.completedAt = session.updatedAt;
            emitImportPipelineEvent(
                session.id,
                'Watchlist import session complete',
                `${session.addedEntities} entities added across ${session.totalRows} rows`
            );
        }

        await saveImportSession(projectId, session);
        return { session: toClientSession(session), batchResult: result };
    } catch (error: any) {
        session.status = 'error';
        session.error = error?.data?.statusMessage || error?.message || 'Import batch failed';
        session.updatedAt = new Date().toISOString();
        await saveImportSession(projectId, session);
        emitImportPipelineEvent(session.id, 'Watchlist import session failed', session.error);
        throw createError({ statusCode: 500, statusMessage: session.error });
    }
});
