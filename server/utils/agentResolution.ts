import type { ResolutionResult } from './projectStore';
import { queryDeployedAgentJson } from './agentRuntime';
import { resolveBatch, resolveEntity } from './resolutionPipeline';

interface ResolutionInput {
    name: string;
    ticker?: string;
    cik?: string;
    lei?: string;
    ein?: string;
    cusip?: string;
    figi?: string;
    isin?: string;
}

interface AgentResolutionJson {
    results?: Array<{
        inputName?: string;
        matched?: boolean;
        name?: string;
        neid?: string;
        entityType?: string;
        confidence?: number;
        matchMethod?: 'name' | 'ticker' | 'cik' | 'neid' | 'unresolved';
        identifiers?: {
            ticker?: string;
            cik?: string;
            lei?: string;
            figi?: string;
            cusip?: string;
            isin?: string;
            ein?: string;
        };
    }>;
}

function countIdentifiers(
    neid: string | undefined,
    ids: {
        ticker?: string;
        cik?: string;
        lei?: string;
        figi?: string;
        cusip?: string;
        isin?: string;
        ein?: string;
    }
): number {
    const base = neid ? 1 : 0;
    return (
        base +
        [ids.ticker, ids.cik, ids.lei, ids.figi, ids.cusip, ids.isin, ids.ein].filter(Boolean)
            .length
    );
}

function normalizeResolution(input: ResolutionInput, candidate: any): ResolutionResult {
    const matched = Boolean(candidate?.matched && candidate?.neid);
    const ids = candidate?.identifiers || {};
    const confidence =
        typeof candidate?.confidence === 'number'
            ? Math.max(0, Math.min(1, candidate.confidence))
            : matched
              ? 0.8
              : 0;
    const matchMethod: ResolutionResult['matchMethod'] = (
        ['name', 'ticker', 'cik', 'neid', 'unresolved'] as const
    ).includes(candidate?.matchMethod)
        ? candidate.matchMethod
        : matched
          ? 'name'
          : 'unresolved';

    return {
        name: matched ? String(candidate?.name || input.name) : input.name,
        matched,
        neid: matched ? String(candidate.neid) : undefined,
        entityType: matched ? String(candidate?.entityType || 'organization') : undefined,
        confidence,
        matchMethod,
        resolutionStrength: countIdentifiers(matched ? String(candidate.neid) : undefined, {
            ticker: ids.ticker || input.ticker,
            cik: ids.cik || input.cik,
            lei: ids.lei || input.lei,
            figi: ids.figi || input.figi,
            cusip: ids.cusip || input.cusip,
            isin: ids.isin || input.isin,
            ein: ids.ein || input.ein,
        }),
        identifiers: {
            neid: matched ? String(candidate.neid) : undefined,
            ticker: ids.ticker || input.ticker,
            cik: ids.cik || input.cik,
            lei: ids.lei || input.lei,
            figi: ids.figi || input.figi,
            cusip: ids.cusip || input.cusip,
        },
    };
}

function buildResolutionPrompt(items: ResolutionInput[]): string {
    return `Resolve the following entities to canonical records in the knowledge graph.
Use tool calls as needed. Return ONLY valid JSON (no markdown).

Input entities:
${JSON.stringify(items, null, 2)}

Return this exact shape:
{
  "results": [
    {
      "inputName": "original input name",
      "matched": true,
      "name": "canonical resolved name",
      "neid": "canonical NEID",
      "entityType": "organization|person|...",
      "confidence": 0.93,
      "matchMethod": "name|ticker|cik|neid|unresolved",
      "identifiers": {
        "ticker": "optional",
        "cik": "optional",
        "lei": "optional",
        "figi": "optional",
        "cusip": "optional",
        "isin": "optional",
        "ein": "optional"
      }
    }
  ]
}

Rules:
- Preserve the same result ordering as input.
- If unresolved, set matched=false and matchMethod=\"unresolved\".
- Do not fabricate identifiers when unknown.`;
}

export async function resolveBatchAgentFirst(
    items: ResolutionInput[]
): Promise<ResolutionResult[]> {
    if (items.length === 0) return [];

    const { result, json } = await queryDeployedAgentJson<AgentResolutionJson>(
        ['dialogue_agent', 'credit_monitor'],
        buildResolutionPrompt(items)
    );

    if (result.ok && json?.results && Array.isArray(json.results) && json.results.length > 0) {
        const normalized = items.map((item, idx) => normalizeResolution(item, json.results?.[idx]));

        // Hardening: if agent response is partial or low-confidence, fall back
        // to direct resolver for unresolved rows only.
        const unresolvedIdx = normalized
            .map((r, idx) => ({ idx, matched: r.matched }))
            .filter((x) => !x.matched)
            .map((x) => x.idx);

        if (unresolvedIdx.length > 0) {
            const fallbackInputs = unresolvedIdx.map((idx) => items[idx]);
            const fallbackResolved = await resolveBatch(fallbackInputs);
            for (let i = 0; i < unresolvedIdx.length; i++) {
                const targetIdx = unresolvedIdx[i];
                const fallback = fallbackResolved[i];
                if (fallback?.matched) {
                    normalized[targetIdx] = fallback;
                }
            }
        }

        return normalized;
    }

    return await resolveBatch(items);
}

export async function resolveEntityAgentFirst(
    name: string,
    providedIds?: Omit<ResolutionInput, 'name'>
): Promise<ResolutionResult> {
    const input: ResolutionInput = { name, ...providedIds };
    const batch = await resolveBatchAgentFirst([input]);
    if (batch[0]?.matched) return batch[0];
    return await resolveEntity(name, providedIds);
}
