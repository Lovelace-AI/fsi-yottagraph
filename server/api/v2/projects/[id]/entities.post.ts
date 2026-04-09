import { addEntity, addEntitiesBatch, type ProjectEntity } from '~/server/utils/projectStore';
import { resolveEntity, resolutionResultToEntity } from '~/server/utils/resolutionPipeline';
import { resolveEntityAgentFirst, resolveBatchAgentFirst } from '~/server/utils/agentResolution';
import { hydrateFinancialInstrumentEntities } from '~/server/utils/instrumentHistory';
import type { ResolutionResult } from '~/server/utils/projectStore';
import { emitActivity, createActivityId } from '~/server/utils/activityBus';

type BatchInput = {
    name: string;
    ticker?: string;
    cik?: string;
    lei?: string;
    ein?: string;
    cusip?: string;
    figi?: string;
    isin?: string;
    rationale?: string;
    entityTypeHint?: 'organization' | 'financial_instrument' | 'person';
    secondaryEntityTypeHint?: 'organization' | 'financial_instrument' | 'person';
};

function dedupeByNeid(entities: ProjectEntity[]): ProjectEntity[] {
    const seen = new Set<string>();
    const unique: ProjectEntity[] = [];
    for (const entity of entities) {
        if (seen.has(entity.neid)) continue;
        seen.add(entity.neid);
        unique.push(entity);
    }
    return unique;
}

async function annotateUndermerge(result: ResolutionResult): Promise<ResolutionResult> {
    if (!result.matched || !result.neid) return result;
    const cik = result.identifiers.cik;
    if (!cik) return result;

    const canonical = await resolveEntity(result.name, { cik });
    if (!canonical.matched || !canonical.neid || canonical.neid === result.neid) {
        return result;
    }

    return {
        ...result,
        resolutionNote: `Possible undermerge: CIK ${cik} also resolves to ${canonical.name} (${canonical.neid})`,
        canonicalNeid: canonical.neid,
        canonicalName: canonical.name,
    };
}

function emitImportActivity(
    sessionId: string,
    agentType: 'dialogue' | 'history' | 'query' | 'composition' | 'pipeline',
    action: string,
    detail?: string,
    entityName?: string,
    durationMs?: number,
    data?: Record<string, unknown>
) {
    emitActivity({
        id: createActivityId(),
        timestamp: Date.now(),
        sessionId,
        agentType,
        action,
        detail,
        entityName,
        durationMs,
        data,
    });
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{
        name?: string;
        batch?: BatchInput[];
        sourceType?: ProjectEntity['sourceType'];
    }>(event);

    // Batch import (from CSV or Gemini research)
    if (body?.batch && body.batch.length > 0) {
        const importSessionId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const sourceType = body.sourceType || 'manual';
        emitImportActivity(
            importSessionId,
            'pipeline',
            'Watchlist import started',
            `${body.batch.length} rows received`,
            undefined,
            undefined,
            { sourceType }
        );

        const resolutionStarted = Date.now();
        const rawResults = await resolveBatchAgentFirst(body.batch);
        emitImportActivity(
            importSessionId,
            'dialogue',
            'Resolved import rows',
            `${rawResults.filter((r) => r.matched).length}/${rawResults.length} rows matched`,
            undefined,
            Date.now() - resolutionStarted
        );

        const verificationStarted = Date.now();
        const results = await Promise.all(rawResults.map(annotateUndermerge));
        emitImportActivity(
            importSessionId,
            'query',
            'Verified hard identifiers',
            `${results.filter((r) => r.resolutionNote).length} possible undermerges flagged`,
            undefined,
            Date.now() - verificationStarted
        );
        const baseEntities: ProjectEntity[] = results.map((r, i) =>
            resolutionResultToEntity(r, sourceType, body.batch![i].rationale)
        );

        const orgBackfillInputs: BatchInput[] = [];
        const instrumentBackfillInputs: BatchInput[] = [];

        for (let i = 0; i < results.length; i++) {
            const resolved = results[i];
            const input = body.batch[i];
            if (!resolved?.matched) continue;

            const wantsSecondaryOrganization = input.secondaryEntityTypeHint === 'organization';
            const wantsSecondaryInstrument =
                input.secondaryEntityTypeHint === 'financial_instrument';

            // If we resolved to stock first, try to backfill the issuing company.
            if (resolved.entityType === 'financial_instrument' || wantsSecondaryOrganization) {
                orgBackfillInputs.push({
                    name: input.name,
                    cik: input.cik,
                    lei: input.lei,
                    ein: input.ein,
                    entityTypeHint: 'organization',
                });
            }

            // If we resolved to organization first and have a ticker,
            // try to backfill the traded common stock instrument.
            if (
                (resolved.entityType === 'organization' || wantsSecondaryInstrument) &&
                input.ticker
            ) {
                instrumentBackfillInputs.push({
                    name: `${input.ticker} stock`,
                    ticker: input.ticker,
                    cik: input.cik,
                    entityTypeHint: 'financial_instrument',
                });
            }
        }

        const orgBackfillResults =
            orgBackfillInputs.length > 0 ? await resolveBatchAgentFirst(orgBackfillInputs) : [];
        const instrumentBackfillResults =
            instrumentBackfillInputs.length > 0
                ? await resolveBatchAgentFirst(instrumentBackfillInputs)
                : [];

        emitImportActivity(
            importSessionId,
            'history',
            'Paired issuer and stock entities',
            `${orgBackfillResults.filter((r) => r.matched).length} issuer backfills, ${instrumentBackfillResults.filter((r) => r.matched).length} instrument backfills`,
            undefined,
            undefined,
            {
                issuerBackfills: orgBackfillResults.filter((r) => r.matched).length,
                instrumentBackfills: instrumentBackfillResults.filter((r) => r.matched).length,
            }
        );

        const backfillEntities: ProjectEntity[] = [
            ...orgBackfillResults
                .filter((r) => r.matched && r.entityType === 'organization')
                .map((r) => resolutionResultToEntity(r, sourceType)),
            ...instrumentBackfillResults
                .filter((r) => r.matched && r.entityType === 'financial_instrument')
                .map((r) => resolutionResultToEntity(r, sourceType)),
        ];

        const historyStarted = Date.now();
        const entities = await hydrateFinancialInstrumentEntities(
            dedupeByNeid([...baseEntities, ...backfillEntities])
        );
        emitImportActivity(
            importSessionId,
            'history',
            'Hydrated instrument trading history',
            `${entities.filter((entity) => entity.instrumentHistory).length} instruments enriched`,
            undefined,
            Date.now() - historyStarted
        );
        const all = await addEntitiesBatch(id, entities);
        emitImportActivity(
            importSessionId,
            'composition',
            'Composed import summary',
            `${entities.length} entities written to project`,
            undefined,
            undefined,
            {
                added: entities.length,
                resolved: entities.filter((e) => e.resolved).length,
                flagged: entities.filter((e) => e.resolutionNote).length,
            }
        );
        emitImportActivity(
            importSessionId,
            'pipeline',
            'Watchlist import complete',
            `${entities.length} entities available in project`
        );
        return {
            added: entities.length,
            resolved: entities.filter((e) => e.resolved).length,
            importSessionId,
            importSummary: {
                inputRows: body.batch.length,
                totalEntities: entities.length,
                resolvedEntities: entities.filter((e) => e.resolved).length,
                conflictFlags: entities.filter((e) => e.resolutionNote).length,
                instrumentsWithHistory: entities.filter((e) => e.instrumentHistory).length,
            },
            entities: all,
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
