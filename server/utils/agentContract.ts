import type { EntityScore, RiskDriver } from './projectStore';

export interface AgentEvidenceItem {
    id: string;
    source: string;
    detail: string;
}

export interface AgentContextPackage {
    summary: string;
    financialData: boolean;
    governanceData: boolean;
    eventsData: boolean;
    newsData: boolean;
    raw?: Record<string, unknown>;
}

export interface AgentEntityAssessment {
    entityName: string;
    neid: string;
    score: EntityScore;
    context: AgentContextPackage;
    evidence: AgentEvidenceItem[];
}

export interface AgentTraceContract {
    agentType: 'dialogue' | 'history' | 'query' | 'composition';
    step: string;
    durationMs: number;
    evidenceCount: number;
    summary: string;
}

export interface AgentScanArtifact {
    projectId: string;
    assessments: AgentEntityAssessment[];
    traces: AgentTraceContract[];
}

export interface AgentResolutionContract {
    inputName: string;
    matched: boolean;
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
    rationale?: string;
}

export interface AgentComparisonContract {
    answer: string;
    evidence: AgentEvidenceItem[];
}

export function severityFromScore(score: number | null): EntityScore['severity'] {
    if (score === null) return 'pending';
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'watch';
    return 'normal';
}

export function normalizeDrivers(drivers: unknown): RiskDriver[] {
    if (!Array.isArray(drivers)) return [];
    return drivers
        .map((d: any) => ({
            lens: d?.lens === 'ers' ? 'ers' : 'fhs',
            signal: String(d?.signal || 'Unspecified signal'),
            description: String(d?.description || ''),
            evidence: d?.evidence ? String(d.evidence) : undefined,
        }))
        .slice(0, 8);
}

export function extractFirstJsonObject(text: string): unknown | null {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
        try {
            return JSON.parse(fenced[1].trim());
        } catch {
            // continue into brace scan fallback
        }
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;

    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}
