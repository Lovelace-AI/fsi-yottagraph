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
    providedIds?: { cik?: string; ticker?: string; cusip?: string; figi?: string; lei?: string }
): Promise<ResolutionResult> {
    // 1. Try hard ID match first
    if (providedIds?.cik) {
        const results = await elementalSearch(providedIds.cik, 3);
        if (results.length > 0) {
            const props = await fetchEntityProperties(results[0].neid);
            const ids = extractIdentifiersFromProperties(props);
            return {
                name: results[0].name,
                matched: true,
                neid: results[0].neid,
                entityType: results[0].flavor || 'organization',
                confidence: 1.0,
                matchMethod: 'cik',
                resolutionStrength: countIdentifiers({
                    neid: results[0].neid,
                    cik: providedIds.cik,
                    ...ids,
                }),
                identifiers: { neid: results[0].neid, cik: providedIds.cik, ...ids },
            };
        }
    }

    if (providedIds?.ticker) {
        const results = await elementalSearch(providedIds.ticker, 3);
        if (results.length > 0) {
            const props = await fetchEntityProperties(results[0].neid);
            const ids = extractIdentifiersFromProperties(props);
            return {
                name: results[0].name,
                matched: true,
                neid: results[0].neid,
                entityType: results[0].flavor || 'organization',
                confidence: 0.95,
                matchMethod: 'ticker',
                resolutionStrength: countIdentifiers({
                    neid: results[0].neid,
                    ticker: providedIds.ticker,
                    ...ids,
                }),
                identifiers: { neid: results[0].neid, ticker: providedIds.ticker, ...ids },
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

export async function resolveBatch(
    entities: { name: string; ticker?: string; cik?: string }[]
): Promise<ResolutionResult[]> {
    const results: ResolutionResult[] = [];
    for (const entity of entities) {
        const result = await resolveEntity(entity.name, {
            ticker: entity.ticker,
            cik: entity.cik,
        });
        results.push(result);
    }
    return results;
}

export function resolutionResultToEntity(
    result: ResolutionResult,
    sourceType: ProjectEntity['sourceType'],
    rationale?: string
): ProjectEntity {
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
        rationale,
        addedAt: new Date().toISOString(),
        addedBy: 'system',
    };
}
