/**
 * TypeScript agent pipeline orchestrator.
 *
 * Runs the 4-phase pipeline (Dialogue → History → Query → Composition)
 * from Nitro server routes using Gemini for reasoning and the Elemental
 * API for data retrieval. Emits SSE activity events at each step.
 *
 * This is the server-side counterpart to the ADK agent — used for
 * background entity scanning and project-wide operations where the
 * full conversational agent isn't needed.
 */

import { generateContent, isGeminiConfigured } from './gemini';
import { emitActivity, createActivityId, type ActivityEvent } from './activityBus';
import {
    listEntities,
    setEntityScore,
    setCachedContext,
    type EntityScore,
    type RiskDriver,
    type AgentSession,
    type AgentTrace,
    saveSession,
} from './projectStore';

interface PipelineConfig {
    fhsWeight: number;
    ersWeight: number;
}

const DEFAULT_CONFIG: PipelineConfig = { fhsWeight: 0.6, ersWeight: 0.4 };

function getGatewayConfig() {
    const config = useRuntimeConfig();
    return {
        gatewayUrl: (config.public as Record<string, string>).gatewayUrl,
        orgId: (config.public as Record<string, string>).tenantOrgId,
        apiKey: (config.public as Record<string, string>).qsApiKey,
    };
}

async function elementalFetch(
    endpoint: string,
    options?: { method?: string; body?: any; headers?: Record<string, string> }
): Promise<any> {
    const { gatewayUrl, orgId, apiKey } = getGatewayConfig();
    if (!gatewayUrl || !orgId) throw new Error('Gateway not configured');
    const url = `${gatewayUrl}/api/qs/${orgId}/${endpoint.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
        ...(apiKey && { 'X-Api-Key': apiKey }),
        ...options?.headers,
    };
    return await $fetch<any>(url, {
        method: (options?.method as any) || 'GET',
        body: options?.body,
        headers,
    });
}

function emit(
    sessionId: string,
    agentType: ActivityEvent['agentType'],
    action: string,
    detail?: string,
    extra?: Partial<ActivityEvent>
): void {
    emitActivity({
        id: createActivityId(),
        timestamp: Date.now(),
        sessionId,
        agentType,
        action,
        detail,
        ...extra,
    });
}

// --- Phase 1: Dialogue (Entity Resolution) ---

async function resolveEntityName(
    name: string,
    sessionId: string
): Promise<{ neid: string; resolvedName: string; entityType: string } | null> {
    const start = Date.now();
    emit(sessionId, 'dialogue', 'Resolving entity', name);

    try {
        const res = await elementalFetch('entities/search', {
            method: 'POST',
            body: {
                queries: [{ queryId: 1, query: name }],
                maxResults: 3,
                includeNames: true,
                includeFlavors: true,
            },
        });
        const matches = res?.results?.[0]?.matches ?? [];
        if (matches.length === 0) {
            emit(sessionId, 'dialogue', 'Entity not found', name, {
                durationMs: Date.now() - start,
            });
            return null;
        }
        const best = matches[0];
        emit(sessionId, 'dialogue', 'Entity resolved', `${name} → ${best.name} (${best.neid})`, {
            durationMs: Date.now() - start,
            entityName: best.name,
        });
        return {
            neid: best.neid,
            resolvedName: best.name || name,
            entityType: best.flavor || 'unknown',
        };
    } catch (e: any) {
        emit(sessionId, 'dialogue', 'Resolution failed', e.message, {
            durationMs: Date.now() - start,
        });
        return null;
    }
}

// --- Phase 2: History (Data Retrieval) ---

async function retrieveEntityContext(
    neid: string,
    entityName: string,
    sessionId: string
): Promise<Record<string, unknown>> {
    const start = Date.now();
    const padded = neid.padStart(20, '0');
    emit(sessionId, 'history', 'Retrieving context', entityName, { entityName });

    const context: Record<string, unknown> = {
        neid: padded,
        name: entityName,
        properties: null,
        relationships: null,
        flags: {
            hasFinancialData: false,
            hasGovernanceData: false,
            hasEvents: false,
            hasNews: false,
        },
    };

    try {
        const propRes = await elementalFetch('elemental/entities/properties', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                eids: JSON.stringify([padded]),
                include_attributes: 'true',
            }).toString(),
        });
        context.properties = propRes?.values ?? [];
        if ((propRes?.values ?? []).length > 0) {
            (context.flags as Record<string, boolean>).hasFinancialData = true;
        }
        emit(
            sessionId,
            'history',
            'Properties retrieved',
            `${(propRes?.values ?? []).length} values`,
            {
                entityName,
            }
        );
    } catch (e: any) {
        emit(sessionId, 'history', 'Properties failed', e.message, { entityName });
    }

    try {
        const relExpression = JSON.stringify({
            type: 'linked',
            linked: { to_entity: padded, distance: 1 },
        });
        const relRes = await elementalFetch('elemental/find', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                expression: relExpression,
                limit: '20',
            }).toString(),
        });
        const relEids = relRes?.eids ?? [];
        context.relationships = relEids;
        if (relEids.length > 0) {
            (context.flags as Record<string, boolean>).hasGovernanceData = true;
        }
        emit(
            sessionId,
            'history',
            'Relationships retrieved',
            `${relEids.length} related entities`,
            {
                entityName,
            }
        );
    } catch (e: any) {
        emit(sessionId, 'history', 'Relationships failed', e.message, { entityName });
    }

    emit(sessionId, 'history', 'Context complete', entityName, {
        durationMs: Date.now() - start,
        entityName,
        data: context.flags as Record<string, unknown>,
    });

    return context;
}

// --- Phase 3: Query (Analytical Reasoning via Gemini) ---

async function analyzeEntity(
    entityName: string,
    context: Record<string, unknown>,
    sessionId: string,
    config: PipelineConfig = DEFAULT_CONFIG
): Promise<EntityScore> {
    const start = Date.now();
    const neid = context.neid as string;
    emit(sessionId, 'query', 'Analyzing risk', entityName, { entityName });

    if (!isGeminiConfigured()) {
        emit(sessionId, 'query', 'Gemini not configured', 'Returning placeholder scores', {
            entityName,
            durationMs: Date.now() - start,
        });
        return {
            neid,
            fhs: null,
            ers: null,
            fused: null,
            severity: 'pending',
            drivers: [],
            computedAt: new Date().toISOString(),
        };
    }

    try {
        const prompt = `Analyze this entity's credit risk based on the available data.

Entity: ${entityName} (NEID: ${neid})
Available data: ${JSON.stringify(context.flags)}
Property values (sample): ${JSON.stringify((context.properties as any[])?.slice(0, 30) ?? [])}
Related entity count: ${((context.relationships as any[]) ?? []).length}

Produce a JSON response with this exact schema:
{
  "fhs": <number 0-100 or null if insufficient data>,
  "ers": <number 0-100 or null if insufficient data>,
  "severity": "<critical|high|watch|normal>",
  "drivers": [
    {"lens": "<fhs|ers>", "signal": "<signal name>", "description": "<one sentence>"}
  ],
  "reasoning": "<2-3 sentences explaining your assessment>"
}

Score interpretation: 0=no risk, 100=maximum risk.
If data is insufficient, set scores to null and severity to "watch" with a driver explaining the data gap.
Return ONLY valid JSON, no markdown fencing.`;

        const response = await generateContent(prompt, {
            systemInstruction:
                'You are a credit risk analyst. Produce structured risk assessments based on available entity data. Always return valid JSON.',
        });

        let parsed: any;
        try {
            const cleaned = response
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            parsed = JSON.parse(cleaned);
        } catch {
            emit(sessionId, 'query', 'Parse error', 'Could not parse Gemini response', {
                entityName,
            });
            parsed = {
                fhs: null,
                ers: null,
                severity: 'pending',
                drivers: [],
                reasoning: response,
            };
        }

        const fhs = typeof parsed.fhs === 'number' ? parsed.fhs : null;
        const ers = typeof parsed.ers === 'number' ? parsed.ers : null;
        let fused: number | null = null;
        if (fhs !== null && ers !== null) {
            fused = Math.round(fhs * config.fhsWeight + ers * config.ersWeight);
        } else if (fhs !== null) {
            fused = fhs;
        } else if (ers !== null) {
            fused = ers;
        }

        const drivers: RiskDriver[] = (parsed.drivers ?? []).map((d: any) => ({
            lens: d.lens === 'ers' ? 'ers' : 'fhs',
            signal: d.signal || 'Unknown signal',
            description: d.description || '',
            evidence: d.evidence,
        }));

        const severity = (['critical', 'high', 'watch', 'normal'] as const).includes(
            parsed.severity
        )
            ? parsed.severity
            : fused !== null
              ? fused >= 80
                  ? 'critical'
                  : fused >= 60
                    ? 'high'
                    : fused >= 40
                      ? 'watch'
                      : 'normal'
              : 'pending';

        const score: EntityScore = {
            neid,
            fhs,
            ers,
            fused,
            severity,
            drivers,
            computedAt: new Date().toISOString(),
        };

        emit(
            sessionId,
            'query',
            'Analysis complete',
            `FHS=${fhs ?? '?'}, ERS=${ers ?? '?'}, Severity=${severity}`,
            {
                entityName,
                durationMs: Date.now() - start,
                data: { fhs, ers, fused, severity },
            }
        );

        return score;
    } catch (e: any) {
        emit(sessionId, 'query', 'Analysis failed', e.message, {
            entityName,
            durationMs: Date.now() - start,
        });
        return {
            neid,
            fhs: null,
            ers: null,
            fused: null,
            severity: 'pending',
            drivers: [{ lens: 'fhs', signal: 'Analysis error', description: e.message }],
            computedAt: new Date().toISOString(),
        };
    }
}

// --- Full Pipeline ---

export async function runEntityScan(
    projectId: string,
    config: PipelineConfig = DEFAULT_CONFIG
): Promise<AgentSession> {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entities = await listEntities(projectId);

    const session: AgentSession = {
        id: sessionId,
        projectId,
        trigger: 'scan',
        status: 'running',
        entityCount: entities.length,
        startedAt: new Date().toISOString(),
        traces: [],
    };
    await saveSession(projectId, session);

    emit(sessionId, 'pipeline', 'Scan started', `${entities.length} entities in project`, {
        data: { projectId, entityCount: entities.length },
    });

    for (const entity of entities) {
        const phaseStart = Date.now();

        // Phase 2: History
        const context = await retrieveEntityContext(entity.neid, entity.name, sessionId);
        await setCachedContext(projectId, entity.neid, context);

        session.traces.push({
            agentType: 'history',
            step: `Retrieve ${entity.name}`,
            durationMs: Date.now() - phaseStart,
            evidenceCount: ((context.properties as any[]) ?? []).length,
            summary: `Retrieved context for ${entity.name}`,
        });

        // Phase 3: Query
        const queryStart = Date.now();
        const score = await analyzeEntity(entity.name, context, sessionId, config);
        await setEntityScore(projectId, score);

        session.traces.push({
            agentType: 'query',
            step: `Analyze ${entity.name}`,
            durationMs: Date.now() - queryStart,
            evidenceCount: score.drivers.length,
            summary: `FHS=${score.fhs ?? '?'}, ERS=${score.ers ?? '?'}, Severity=${score.severity}`,
        });
    }

    session.status = 'complete';
    session.completedAt = new Date().toISOString();
    await saveSession(projectId, session);

    emit(sessionId, 'pipeline', 'Scan complete', `${entities.length} entities analyzed`, {
        data: { projectId, sessionId },
    });

    return session;
}

export async function runSingleEntityPipeline(
    projectId: string,
    neid: string,
    entityName: string,
    config: PipelineConfig = DEFAULT_CONFIG
): Promise<EntityScore> {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    emit(sessionId, 'pipeline', 'Single entity scan', entityName, { entityName });

    const context = await retrieveEntityContext(neid, entityName, sessionId);
    await setCachedContext(projectId, neid, context);

    const score = await analyzeEntity(entityName, context, sessionId, config);
    await setEntityScore(projectId, score);

    return score;
}

export { resolveEntityName };
