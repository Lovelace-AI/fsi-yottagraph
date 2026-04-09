import { addEntity, type ProjectEntity } from '~/server/utils/projectStore';
import { resolutionResultToEntity } from '~/server/utils/resolutionPipeline';
import { resolveEntityAgentFirst } from '~/server/utils/agentResolution';
import { hydrateFinancialInstrumentEntities } from '~/server/utils/instrumentHistory';
import {
    annotateUndermerge,
    processWatchlistImportBatch,
    createImportSessionId,
    emitImportPipelineEvent,
    type WatchlistBatchInput,
} from '~/server/utils/watchlistImport';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{
        name?: string;
        batch?: WatchlistBatchInput[];
        sourceType?: ProjectEntity['sourceType'];
    }>(event);

    // Batch import (from CSV or Gemini research)
    if (body?.batch && body.batch.length > 0) {
        const importSessionId = createImportSessionId();
        const sourceType = body.sourceType || 'manual';
        emitImportPipelineEvent(
            importSessionId,
            'Watchlist import started',
            `${body.batch.length} rows received`,
            { sourceType }
        );
        const result = await processWatchlistImportBatch({
            projectId: id,
            batch: body.batch,
            sourceType,
            importSessionId,
        });
        emitImportPipelineEvent(
            importSessionId,
            'Watchlist import complete',
            `${result.added} new entities written in this batch`
        );
        return {
            added: result.added,
            resolved: result.resolved,
            importSessionId,
            importSummary: {
                inputRows: body.batch.length,
                totalEntities: result.processedEntities.length,
                resolvedEntities: result.resolved,
                conflictFlags: result.conflictFlags,
                instrumentsWithHistory: result.instrumentsWithHistory,
            },
            entities: result.entities,
        };
    }

    // Single entity add
    if (!body?.name?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Entity name is required' });
    }

    const result = await resolveEntityAgentFirst(body.name.trim());
    const annotatedResult = await annotateUndermerge(result);
    if (!annotatedResult.matched) {
        throw createError({
            statusCode: 404,
            statusMessage: `Could not resolve entity "${body.name}" in the knowledge graph`,
        });
    }

    const [entity] = await hydrateFinancialInstrumentEntities([
        resolutionResultToEntity(annotatedResult, body.sourceType || 'manual'),
    ]);
    const entities = await addEntity(id, entity);
    return { entity, entities };
});
