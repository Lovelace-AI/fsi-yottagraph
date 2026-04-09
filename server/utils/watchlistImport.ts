import { emitActivity, createActivityId } from './activityBus';
import {
    addEntitiesBatch,
    listEntities,
    type ProjectEntity,
    type ResolutionResult,
} from './projectStore';
import { resolveEntity, resolutionResultToEntity } from './resolutionPipeline';
import { resolveBatchAgentFirst } from './agentResolution';
import { hydrateFinancialInstrumentEntities } from './instrumentHistory';

export type WatchlistBatchInput = {
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

export interface WatchlistBatchImportResult {
    added: number;
    resolved: number;
    conflictFlags: number;
    instrumentsWithHistory: number;
    processedEntities: ProjectEntity[];
    entities: ProjectEntity[];
}

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

export async function annotateUndermerge(result: ResolutionResult): Promise<ResolutionResult> {
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

export async function processWatchlistImportBatch(args: {
    projectId: string;
    batch: WatchlistBatchInput[];
    sourceType: ProjectEntity['sourceType'];
    importSessionId: string;
}): Promise<WatchlistBatchImportResult> {
    const { projectId, batch, sourceType, importSessionId } = args;

    const resolutionStarted = Date.now();
    const rawResults = await resolveBatchAgentFirst(batch);
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

    const baseEntities: ProjectEntity[] = results.map((result, index) =>
        resolutionResultToEntity(result, sourceType, batch[index].rationale)
    );

    const orgBackfillInputs: WatchlistBatchInput[] = [];
    const instrumentBackfillInputs: WatchlistBatchInput[] = [];

    for (let i = 0; i < results.length; i++) {
        const resolved = results[i];
        const input = batch[i];
        if (!resolved?.matched) continue;

        const wantsSecondaryOrganization = input.secondaryEntityTypeHint === 'organization';
        const wantsSecondaryInstrument = input.secondaryEntityTypeHint === 'financial_instrument';

        if (resolved.entityType === 'financial_instrument' || wantsSecondaryOrganization) {
            orgBackfillInputs.push({
                name: input.name,
                cik: input.cik,
                lei: input.lei,
                ein: input.ein,
                entityTypeHint: 'organization',
            });
        }

        if ((resolved.entityType === 'organization' || wantsSecondaryInstrument) && input.ticker) {
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
            .filter((result) => result.matched && result.entityType === 'organization')
            .map((result) => resolutionResultToEntity(result, sourceType)),
        ...instrumentBackfillResults
            .filter((result) => result.matched && result.entityType === 'financial_instrument')
            .map((result) => resolutionResultToEntity(result, sourceType)),
    ];

    const historyStarted = Date.now();
    const processedEntities = await hydrateFinancialInstrumentEntities(
        dedupeByNeid([...baseEntities, ...backfillEntities])
    );
    emitImportActivity(
        importSessionId,
        'history',
        'Hydrated instrument trading history',
        `${processedEntities.filter((entity) => entity.instrumentHistory).length} instruments enriched`,
        undefined,
        Date.now() - historyStarted
    );

    const beforeCount = (await listEntities(projectId)).length;
    const all = await addEntitiesBatch(projectId, processedEntities);
    const added = Math.max(0, all.length - beforeCount);

    emitImportActivity(
        importSessionId,
        'composition',
        'Composed import summary',
        `${added} new entities written in this batch`,
        undefined,
        undefined,
        {
            added,
            resolved: processedEntities.filter((entity) => entity.resolved).length,
            flagged: processedEntities.filter((entity) => entity.resolutionNote).length,
        }
    );

    return {
        added,
        resolved: processedEntities.filter((entity) => entity.resolved).length,
        conflictFlags: processedEntities.filter((entity) => entity.resolutionNote).length,
        instrumentsWithHistory: processedEntities.filter((entity) => entity.instrumentHistory)
            .length,
        processedEntities,
        entities: all,
    };
}

export function createImportSessionId(): string {
    return `import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function emitImportPipelineEvent(
    sessionId: string,
    action: string,
    detail?: string,
    data?: Record<string, unknown>
) {
    emitImportActivity(sessionId, 'pipeline', action, detail, undefined, undefined, data);
}
