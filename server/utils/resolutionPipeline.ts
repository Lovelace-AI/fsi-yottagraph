/**
 * Entity Resolution Pipeline — Elemental-based.
 *
 * Resolves entity names/identifiers to canonical records in the Elemental
 * Knowledge Graph. Populates NEIDs and available identifiers (CIK, ticker,
 * LEI, etc.) from Elemental properties.
 *
 * Resolution strategy (ordered by priority):
 * 1. Hard ID match (CIK, ticker) — search Elemental with identifier
 * 2. Name resolution — search with name variants (raw, without legal suffix, without share class)
 * 3. Property enrichment — fetch identifier properties for resolved entities
 */

import type { ProjectEntity, ResolutionResult } from './projectStore';

function getGatewayConfig() {
    const config = useRuntimeConfig();
    return {
        gatewayUrl: (config.public as Record<string, string>).gatewayUrl,
        orgId: (config.public as Record<string, string>).tenantOrgId,
        apiKey: (config.public as Record<string, string>).qsApiKey,
    };
}

async function elementalSearch(
    query: string,
    maxResults = 5
): Promise<{ neid: string; name: string; flavor?: string; score?: number }[]> {
    const { gatewayUrl, orgId, apiKey } = getGatewayConfig();
    if (!gatewayUrl || !orgId) return [];
    try {
        const res = await $fetch<any>(`${gatewayUrl}/api/qs/${orgId}/entities/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey && { 'X-Api-Key': apiKey }),
            },
            body: {
                queries: [{ queryId: 1, query }],
                maxResults,
                includeNames: true,
                includeFlavors: true,
            },
        });
        return (res?.results?.[0]?.matches ?? []).map((m: any) => ({
            neid: m.neid,
            name: m.name || query,
            flavor: m.flavor,
            score: m.score,
        }));
    } catch {
        return [];
    }
}

async function elementalSearchBatch(
    queries: string[],
    maxResults = 3
): Promise<Array<{ neid: string; name: string; flavor?: string; score?: number }[]>> {
    const { gatewayUrl, orgId, apiKey } = getGatewayConfig();
    if (!gatewayUrl || !orgId || queries.length === 0) return queries.map(() => []);
    try {
        const res = await $fetch<any>(`${gatewayUrl}/api/qs/${orgId}/entities/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey && { 'X-Api-Key': apiKey }),
            },
            body: {
                queries: queries.map((query, i) => ({ queryId: i + 1, query })),
                maxResults,
                includeNames: true,
                includeFlavors: true,
            },
        });

        const resultsByQueryId = new Map<number, any>();
        for (const r of res?.results ?? []) {
            resultsByQueryId.set(r.queryId, r);
        }

        return queries.map((_, i) =>
            ((resultsByQueryId.get(i + 1)?.matches ?? []) as any[]).map((m: any) => ({
                neid: m.neid,
                name: m.name || queries[i],
                flavor: m.flavor,
                score: m.score,
            }))
        );
    } catch {
        return queries.map(() => []);
    }
}

async function fetchEntityProperties(neid: string): Promise<Record<string, any>> {
    const { gatewayUrl, orgId, apiKey } = getGatewayConfig();
    if (!gatewayUrl || !orgId) return {};
    const padded = neid.padStart(20, '0');
    try {
        const res = await $fetch<any>(
            `${gatewayUrl}/api/qs/${orgId}/elemental/entities/properties`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    ...(apiKey && { 'X-Api-Key': apiKey }),
                },
                body: new URLSearchParams({
                    eids: JSON.stringify([padded]),
                    include_attributes: 'true',
                }).toString(),
            }
        );
        const values = res?.values ?? [];
        const props: Record<string, any> = {};
        for (const v of values) {
            const name = v.property_name || `pid_${v.pid}`;
            if (!props[name]) props[name] = v.value;
        }
        return props;
    } catch {
        return {};
    }
}

const LEGAL_SUFFIXES =
    /\s+(inc\.?|corp\.?|llc|ltd\.?|l\.?p\.?|plc|co\.?|company|group|holdings?|enterprises?|international|intl\.?)$/i;
const SHARE_CLASS = /\s+(-\s*)?(class\s+[a-z]|cl\s+[a-z]|series\s+[a-z])$/i;

function nameVariants(name: string): string[] {
    const variants = [name];
    const withoutLegal = name.replace(LEGAL_SUFFIXES, '').trim();
    if (withoutLegal !== name) variants.push(withoutLegal);
    const withoutClass = name.replace(SHARE_CLASS, '').trim();
    if (withoutClass !== name && !variants.includes(withoutClass)) variants.push(withoutClass);
    const withoutBoth = withoutLegal.replace(SHARE_CLASS, '').trim();
    if (withoutBoth !== name && !variants.includes(withoutBoth)) variants.push(withoutBoth);
    return variants;
}

function normalizeEntityName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(LEGAL_SUFFIXES, '')
        .replace(SHARE_CLASS, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function namesRoughlyMatch(inputName: string, candidateName: string): boolean {
    const a = normalizeEntityName(inputName);
    const b = normalizeEntityName(candidateName);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    const aTokens = new Set(a.split(' ').filter(Boolean));
    const bTokens = new Set(b.split(' ').filter(Boolean));
    let overlap = 0;
    for (const token of aTokens) {
        if (bTokens.has(token)) overlap++;
    }
    return overlap >= Math.min(2, Math.min(aTokens.size, bTokens.size));
}

function countIdentifiers(entity: Partial<ProjectEntity>): number {
    let count = 0;
    if (entity.neid) count++;
    if (entity.cik) count++;
    if (entity.ticker) count++;
    if (entity.lei) count++;
    if (entity.figi) count++;
    if (entity.cusip) count++;
    if (entity.isin) count++;
    if (entity.ein) count++;
    return count;
}

function extractIdentifiersFromProperties(props: Record<string, any>): Partial<ProjectEntity> {
    const ids: Partial<ProjectEntity> = {};
    for (const [key, val] of Object.entries(props)) {
        const k = key.toLowerCase();
        if (!val) continue;
        const v = String(val);
        if (k.includes('cik') && !ids.cik) ids.cik = v;
        else if ((k.includes('ticker') || k.includes('symbol')) && !ids.ticker) ids.ticker = v;
        else if (k.includes('lei') && !ids.lei) ids.lei = v;
        else if (k.includes('figi') && !ids.figi) ids.figi = v;
        else if (k.includes('cusip') && !ids.cusip) ids.cusip = v;
        else if (k.includes('isin') && !ids.isin) ids.isin = v;
        else if (k.includes('ein') && !ids.ein) ids.ein = v;
    }
    return ids;
}

export async function resolveEntity(
    name: string,
    providedIds?: {
        cik?: string;
        ticker?: string;
        cusip?: string;
        figi?: string;
        lei?: string;
        ein?: string;
        isin?: string;
    }
): Promise<ResolutionResult> {
    // 1. Try hard ID matches in priority order (deterministic, highest confidence)
    const hardIdAttempts: {
        id: string;
        method: ProjectEntity['matchMethod'];
        confidence: number;
    }[] = [];
    if (providedIds?.cik)
        hardIdAttempts.push({ id: providedIds.cik, method: 'cik', confidence: 1.0 });
    if (providedIds?.lei)
        hardIdAttempts.push({ id: providedIds.lei, method: 'neid', confidence: 0.98 });
    if (providedIds?.ticker)
        hardIdAttempts.push({ id: providedIds.ticker, method: 'ticker', confidence: 0.95 });
    if (providedIds?.cusip)
        hardIdAttempts.push({ id: providedIds.cusip, method: 'neid', confidence: 0.95 });
    if (providedIds?.figi)
        hardIdAttempts.push({ id: providedIds.figi, method: 'neid', confidence: 0.95 });
    if (providedIds?.isin)
        hardIdAttempts.push({ id: providedIds.isin, method: 'neid', confidence: 0.95 });
    if (providedIds?.ein)
        hardIdAttempts.push({ id: providedIds.ein, method: 'neid', confidence: 0.9 });

    for (const attempt of hardIdAttempts) {
        const results = await elementalSearch(attempt.id, 3);
        if (results.length > 0) {
            const props = await fetchEntityProperties(results[0].neid);
            const ids = extractIdentifiersFromProperties(props);
            const mergedIds = { ...providedIds, neid: results[0].neid, ...ids };
            return {
                name: results[0].name || name,
                matched: true,
                neid: results[0].neid,
                entityType: results[0].flavor || 'organization',
                confidence: attempt.confidence,
                matchMethod: attempt.method,
                resolutionStrength: countIdentifiers(mergedIds as Partial<ProjectEntity>),
                identifiers: {
                    neid: results[0].neid,
                    cik: mergedIds.cik,
                    ticker: mergedIds.ticker,
                    lei: mergedIds.lei,
                    figi: mergedIds.figi,
                    cusip: mergedIds.cusip,
                },
            };
        }
    }

    // 2. Name resolution with variants
    const variants = nameVariants(name);
    for (const variant of variants) {
        const results = await elementalSearch(variant, 3);
        if (results.length > 0 && results[0].score && results[0].score > 0.5) {
            const props = await fetchEntityProperties(results[0].neid);
            const ids = extractIdentifiersFromProperties(props);
            const confidence = Math.min(results[0].score || 0.7, 1.0);
            return {
                name: results[0].name,
                matched: true,
                neid: results[0].neid,
                entityType: results[0].flavor || 'organization',
                confidence,
                matchMethod: 'name',
                resolutionStrength: countIdentifiers({ neid: results[0].neid, ...ids }),
                identifiers: { neid: results[0].neid, ...ids },
            };
        }
    }

    // 3. Fallback: try raw name without score threshold
    const fallback = await elementalSearch(name, 1);
    if (fallback.length > 0) {
        return {
            name: fallback[0].name,
            matched: true,
            neid: fallback[0].neid,
            entityType: fallback[0].flavor || 'organization',
            confidence: 0.4,
            matchMethod: 'name',
            resolutionStrength: 1,
            identifiers: { neid: fallback[0].neid },
        };
    }

    // 4. Unresolved
    return {
        name,
        matched: false,
        confidence: 0,
        matchMethod: 'unresolved',
        resolutionStrength: 0,
        identifiers: {},
    };
}

export async function resolveEntityQuick(
    name: string,
    providedIds?: {
        ticker?: string;
        cik?: string;
        lei?: string;
        ein?: string;
        cusip?: string;
        figi?: string;
        isin?: string;
    }
): Promise<ResolutionResult> {
    // Try hard IDs first (highest confidence), then name
    const searchTerms = [
        providedIds?.cik,
        providedIds?.lei,
        providedIds?.ticker,
        providedIds?.cusip,
        providedIds?.figi,
        providedIds?.isin,
        providedIds?.ein,
        name,
    ].filter(Boolean) as string[];

    for (const term of searchTerms) {
        const results = await elementalSearch(term, 3);
        if (results.length > 0) {
            const best = results[0];
            const isHardId = term !== name;
            const hardIdLooksValid =
                !isHardId ||
                term === providedIds?.cik ||
                term === providedIds?.lei ||
                namesRoughlyMatch(name, best.name || '');

            if (!hardIdLooksValid) {
                continue;
            }
            return {
                name: best.name || name,
                matched: true,
                neid: best.neid,
                entityType: best.flavor || 'organization',
                confidence: isHardId ? 0.95 : Math.min(best.score || 0.7, 1.0),
                matchMethod: isHardId
                    ? term === providedIds?.cik
                        ? 'cik'
                        : term === providedIds?.ticker
                          ? 'ticker'
                          : 'neid'
                    : 'name',
                resolutionStrength: 1 + Object.values(providedIds || {}).filter(Boolean).length,
                identifiers: {
                    neid: best.neid,
                    ticker: providedIds?.ticker,
                    cik: providedIds?.cik,
                    lei: providedIds?.lei,
                    cusip: providedIds?.cusip,
                    figi: providedIds?.figi,
                },
            };
        }
    }

    return {
        name,
        matched: false,
        confidence: 0,
        matchMethod: 'unresolved',
        resolutionStrength: 0,
        identifiers: {},
    };
}

export async function resolveBatch(
    entities: {
        name: string;
        ticker?: string;
        cik?: string;
        lei?: string;
        ein?: string;
        cusip?: string;
        figi?: string;
        isin?: string;
    }[]
): Promise<ResolutionResult[]> {
    const hardIdForEntity = (entity: (typeof entities)[number]) =>
        entity.cik ||
        entity.lei ||
        entity.ticker ||
        entity.cusip ||
        entity.figi ||
        entity.isin ||
        entity.ein ||
        entity.name;

    const buildQuickResult = (
        entity: (typeof entities)[number],
        match: { neid: string; name: string; flavor?: string; score?: number } | null,
        usedQuery: string
    ): ResolutionResult => {
        if (!match) {
            return {
                name: entity.name,
                matched: false,
                confidence: 0,
                matchMethod: 'unresolved',
                resolutionStrength: 0,
                identifiers: {},
            };
        }

        const isHardId = usedQuery !== entity.name;
        return {
            name: match.name || entity.name,
            matched: true,
            neid: match.neid,
            entityType: match.flavor || 'organization',
            confidence: isHardId ? 0.95 : Math.min(match.score || 0.7, 1.0),
            matchMethod: isHardId
                ? usedQuery === entity.cik
                    ? 'cik'
                    : usedQuery === entity.ticker
                      ? 'ticker'
                      : 'neid'
                : 'name',
            resolutionStrength:
                1 +
                [
                    entity.ticker,
                    entity.cik,
                    entity.lei,
                    entity.ein,
                    entity.cusip,
                    entity.figi,
                    entity.isin,
                ].filter(Boolean).length,
            identifiers: {
                neid: match.neid,
                ticker: entity.ticker,
                cik: entity.cik,
                lei: entity.lei,
                cusip: entity.cusip,
                figi: entity.figi,
            },
        };
    };

    const results: ResolutionResult[] = new Array(entities.length);
    const batchSize = 50;

    for (let i = 0; i < entities.length; i += batchSize) {
        const chunk = entities.slice(i, i + batchSize);
        const hardQueries = chunk.map(hardIdForEntity);
        const hardMatches = await elementalSearchBatch(hardQueries, 3);

        const unresolvedForNamePass: Array<{ idx: number; entity: (typeof entities)[number] }> = [];

        for (let j = 0; j < chunk.length; j++) {
            const entity = chunk[j];
            const matches = hardMatches[j] || [];
            const usedQuery = hardQueries[j];

            let accepted =
                matches.find((m) => namesRoughlyMatch(entity.name, m.name || '')) ||
                (usedQuery === entity.name ? matches[0] : null) ||
                (entity.cik || entity.lei ? matches[0] : null);

            if (!accepted) {
                unresolvedForNamePass.push({ idx: i + j, entity });
                continue;
            }

            results[i + j] = buildQuickResult(entity, accepted, usedQuery);
        }

        if (unresolvedForNamePass.length > 0) {
            const nameQueries = unresolvedForNamePass.map(({ entity }) => entity.name);
            const nameMatches = await elementalSearchBatch(nameQueries, 3);

            for (let k = 0; k < unresolvedForNamePass.length; k++) {
                const { idx, entity } = unresolvedForNamePass[k];
                const matches = nameMatches[k] || [];
                const accepted =
                    matches.find((m) => namesRoughlyMatch(entity.name, m.name || '')) ||
                    matches[0] ||
                    null;
                results[idx] = buildQuickResult(entity, accepted, entity.name);
            }
        }
    }

    return results;
}

export function resolutionResultToEntity(
    result: ResolutionResult,
    sourceType: ProjectEntity['sourceType'],
    rationale?: string
): ProjectEntity {
    const mergedRationale = [rationale, result.resolutionNote].filter(Boolean).join(' | ');
    return {
        neid: result.neid || `unresolved_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: result.name,
        entityType: result.entityType || 'organization',
        cik: result.identifiers.cik,
        ticker: result.identifiers.ticker,
        lei: result.identifiers.lei,
        figi: result.identifiers.figi,
        cusip: result.identifiers.cusip,
        matchMethod: result.matchMethod,
        confidence: result.confidence,
        resolutionStrength: result.resolutionStrength,
        sourceType,
        resolved: result.matched,
        resolvedAt: result.matched ? new Date().toISOString() : undefined,
        rationale: mergedRationale || undefined,
        resolutionNote: result.resolutionNote,
        canonicalNeid: result.canonicalNeid,
        canonicalName: result.canonicalName,
        addedAt: new Date().toISOString(),
        addedBy: 'system',
    };
}
