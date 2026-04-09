import {
    listEntities,
    saveSession,
    setCachedContext,
    setEntityScore,
    type AgentSession,
    type EntityScore,
} from './projectStore';
import { emitActivity, createActivityId } from './activityBus';
import { normalizeDrivers, severityFromScore } from './agentContract';
import { queryDeployedAgentJson } from './agentRuntime';
import { runSingleEntityPipeline } from './agentPipeline';

interface AgentScanJson {
    entity?: {
        name?: string;
        neid?: string;
    };
    context?: {
        summary?: string;
        financialData?: boolean;
        governanceData?: boolean;
        eventsData?: boolean;
        newsData?: boolean;
    };
    analysis?: {
        fhs?: number | null;
        ers?: number | null;
        fused?: number | null;
        severity?: 'critical' | 'high' | 'watch' | 'normal' | 'pending';
        drivers?: Array<{ lens?: 'fhs' | 'ers'; signal?: string; description?: string }>;
    };
}

function emit(
    sessionId: string,
    agentType: 'dialogue' | 'history' | 'query' | 'composition' | 'pipeline',
    action: string,
    detail?: string,
    entityName?: string,
    durationMs?: number
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
    });
}

function normalizeScore(neid: string, json: AgentScanJson | null): EntityScore | null {
    if (!json?.analysis) return null;
    const fhs = typeof json.analysis.fhs === 'number' ? json.analysis.fhs : null;
    const ers = typeof json.analysis.ers === 'number' ? json.analysis.ers : null;
    let fused = typeof json.analysis.fused === 'number' ? json.analysis.fused : null;
    if (fused === null && fhs !== null && ers !== null) {
        fused = Math.round(fhs * 0.6 + ers * 0.4);
    } else if (fused === null && fhs !== null) {
        fused = fhs;
    } else if (fused === null && ers !== null) {
        fused = ers;
    }

    const severity =
        json.analysis.severity &&
        ['critical', 'high', 'watch', 'normal', 'pending'].includes(json.analysis.severity)
            ? json.analysis.severity
            : severityFromScore(fused);

    return {
        neid,
        fhs,
        ers,
        fused,
        severity,
        drivers: normalizeDrivers(json.analysis.drivers),
        computedAt: new Date().toISOString(),
    };
}

function buildScanPrompt(entity: { name: string; neid: string; ticker?: string; cik?: string }) {
    return `You are running one scan step in an agent-first credit monitor.
Resolve and retrieve context for the provided entity using your available tools, then return a compact JSON assessment.

Entity input:
- name: ${entity.name}
- neid: ${entity.neid}
- ticker: ${entity.ticker || ''}
- cik: ${entity.cik || ''}

Return ONLY valid JSON with this exact shape:
{
  "entity": {"name": "string", "neid": "string"},
  "context": {
    "summary": "1-2 sentence context summary",
    "financialData": true,
    "governanceData": true,
    "eventsData": true,
    "newsData": true
  },
  "analysis": {
    "fhs": 0,
    "ers": 0,
    "fused": 0,
    "severity": "critical|high|watch|normal|pending",
    "drivers": [
      {"lens": "fhs|ers", "signal": "short label", "description": "one sentence"}
    ]
  }
}

Rules:
- If data is insufficient, set missing scores to null and severity to "pending" or "watch".
- Do not include markdown fences.
- Keep drivers to max 4 items.`;
}

export async function runAgentFirstScan(projectId: string): Promise<AgentSession> {
    const entities = await listEntities(projectId);
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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

    emit(sessionId, 'pipeline', 'Scan started', `${entities.length} entities in project`);

    for (const entity of entities) {
        const started = Date.now();
        emit(sessionId, 'pipeline', 'Invoking deployed agent', entity.name, entity.name);

        const { result, json } = await queryDeployedAgentJson<AgentScanJson>(
            ['credit_monitor', 'query_agent'],
            buildScanPrompt(entity)
        );

        let score = normalizeScore(entity.neid, json);
        let usedFallback = false;

        if (!score) {
            usedFallback = true;
            score = await runSingleEntityPipeline(projectId, entity.neid, entity.name);
        } else {
            await setCachedContext(projectId, entity.neid, {
                source: 'deployed_agent',
                summary: json?.context?.summary || '',
                flags: {
                    hasFinancialData: Boolean(json?.context?.financialData),
                    hasGovernanceData: Boolean(json?.context?.governanceData),
                    hasEvents: Boolean(json?.context?.eventsData),
                    hasNews: Boolean(json?.context?.newsData),
                },
            });
        }

        await setEntityScore(projectId, score);

        session.traces.push({
            agentType: 'query',
            step: `Analyze ${entity.name}`,
            durationMs: Date.now() - started,
            evidenceCount: score.drivers.length,
            summary: usedFallback
                ? `Fallback analysis used for ${entity.name}`
                : `Agent ${result.agentName} produced ${score.severity} assessment`,
        });

        emit(
            sessionId,
            'query',
            usedFallback ? 'Fallback analysis complete' : 'Deployed agent analysis complete',
            `${entity.name} · severity=${score.severity}`,
            entity.name,
            Date.now() - started
        );
    }

    session.status = 'complete';
    session.completedAt = new Date().toISOString();
    await saveSession(projectId, session);

    emit(sessionId, 'pipeline', 'Scan complete', `${entities.length} entities analyzed`);
    return session;
}
