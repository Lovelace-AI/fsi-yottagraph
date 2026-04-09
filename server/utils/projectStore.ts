/**
 * KV-backed project store for the Credit Monitor.
 *
 * Stores projects, entities, scores, assessments, and agent sessions
 * in Upstash Redis. Falls back to in-memory storage when KV is not
 * configured (local dev).
 */

import { getRedis } from './redis';
import { getDb } from './neon';

export interface Project {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectEntity {
    neid: string;
    name: string;
    entityType: string;
    cik?: string;
    ticker?: string;
    exchange?: string;
    securityType?: string;
    lei?: string;
    figi?: string;
    cusip?: string;
    isin?: string;
    ein?: string;
    matchMethod:
        | 'name'
        | 'ticker'
        | 'cik'
        | 'neid'
        | 'gemini_research'
        | 'csv'
        | 'manual'
        | 'unresolved';
    confidence: number;
    resolutionStrength: number;
    sourceType: 'manual' | 'csv' | 'gemini_research' | 'seed';
    resolved: boolean;
    resolvedAt?: string;
    rationale?: string;
    resolutionNote?: string;
    canonicalNeid?: string;
    canonicalName?: string;
    instrumentHistory?: {
        tickerSymbolHistory: {
            value: string;
            effectiveFrom: string;
            lastSeenAt: string;
            ref?: string;
        }[];
        exchangeHistory: {
            value: string;
            effectiveFrom: string;
            lastSeenAt: string;
            ref?: string;
        }[];
        companyNameHistory: {
            value: string;
            effectiveFrom: string;
            lastSeenAt: string;
            ref?: string;
        }[];
        securityTypeHistory: {
            value: string;
            effectiveFrom: string;
            lastSeenAt: string;
            ref?: string;
        }[];
        predecessorInstruments: {
            neid: string;
            name?: string;
            effectiveFrom: string;
            lastSeenAt: string;
        }[];
    };
    addedAt: string;
    addedBy: string;
}

export interface ResearchPlan {
    id: string;
    projectId: string;
    topic: string;
    context?: string;
    geography?: string;
    timeHorizon?: string;
    template?: string;
    topicSummary: string;
    subthemes: string[];
    adjacentDomains: string[];
    keywords: string[];
    signalHypotheses: string[];
    targetEntities: ResearchEntity[];
    searchQueries: string[];
    coverageNotes?: string;
    createdAt: string;
}

export interface ResearchEntity {
    name: string;
    ticker?: string;
    rationale: string;
    selected?: boolean;
}

export interface ResolutionResult {
    name: string;
    matched: boolean;
    neid?: string;
    entityType?: string;
    confidence: number;
    matchMethod: ProjectEntity['matchMethod'];
    resolutionStrength: number;
    identifiers: {
        cik?: string;
        ticker?: string;
        lei?: string;
        neid?: string;
        figi?: string;
        cusip?: string;
    };
    resolutionNote?: string;
    canonicalNeid?: string;
    canonicalName?: string;
}

export interface ResolutionStats {
    total: number;
    resolved: number;
    unresolved: number;
    avgConfidence: number;
    avgResolutionStrength: number;
    identifierCoverage: Record<string, number>;
}

export interface EntityScore {
    neid: string;
    fhs: number | null;
    ers: number | null;
    fused: number | null;
    severity: 'critical' | 'high' | 'watch' | 'normal' | 'pending';
    drivers: RiskDriver[];
    computedAt: string;
    sessionId?: string;
}

export interface RiskDriver {
    lens: 'fhs' | 'ers';
    signal: string;
    description: string;
    evidence?: string;
}

export interface Assessment {
    neid: string;
    severity: 'critical' | 'high' | 'watch' | 'normal';
    justification: string;
    assessedBy: string;
    assessedAt: string;
}

export interface AgentSession {
    id: string;
    projectId: string;
    trigger: 'user' | 'scan' | 'schedule';
    status: 'running' | 'complete' | 'error';
    entityCount: number;
    startedAt: string;
    completedAt?: string;
    traces: AgentTrace[];
}

export interface AgentTrace {
    agentType: 'dialogue' | 'history' | 'query' | 'composition';
    step: string;
    durationMs: number;
    evidenceCount: number;
    summary: string;
}

export interface ImportSessionRow {
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
}

export interface ImportSession {
    id: string;
    projectId: string;
    sourceType: ProjectEntity['sourceType'];
    status: 'pending' | 'running' | 'complete' | 'error';
    totalRows: number;
    processedRows: number;
    batchSize: number;
    rows: ImportSessionRow[];
    addedEntities: number;
    resolvedEntities: number;
    conflictFlags: number;
    instrumentsWithHistory: number;
    lastDetail?: string;
    error?: string;
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
}

const PREFIX = 'v2';

// In-memory fallback for local dev (when KV is not configured)
const memStore = new Map<string, string>();
let _pgInitialized = false;

async function ensurePgStoreTable() {
    if (_pgInitialized) return;
    const sql = getDb();
    if (!sql) return;
    await sql`
        CREATE TABLE IF NOT EXISTS app_kv_store (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;
    _pgInitialized = true;
}

async function kvGet<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (redis) {
        const val = await redis.get(key);
        if (val === null || val === undefined) return null;
        return typeof val === 'string' ? JSON.parse(val) : (val as T);
    }
    const sql = getDb();
    if (sql) {
        await ensurePgStoreTable();
        const rows = await sql`SELECT value FROM app_kv_store WHERE key = ${key} LIMIT 1`;
        const row = rows[0] as { value?: T } | undefined;
        return row?.value ?? null;
    }
    const val = memStore.get(key);
    return val ? JSON.parse(val) : null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
    const redis = getRedis();
    if (redis) {
        await redis.set(key, JSON.stringify(value));
        return;
    }
    const sql = getDb();
    if (sql) {
        await ensurePgStoreTable();
        await sql`
            INSERT INTO app_kv_store (key, value, updated_at)
            VALUES (${key}, ${JSON.stringify(value)}::jsonb, NOW())
            ON CONFLICT (key)
            DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `;
        return;
    }
    memStore.set(key, JSON.stringify(value));
}

async function kvDel(key: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
        await redis.del(key);
        return;
    }
    const sql = getDb();
    if (sql) {
        await ensurePgStoreTable();
        await sql`DELETE FROM app_kv_store WHERE key = ${key}`;
        return;
    }
    memStore.delete(key);
}

// --- Projects ---

export async function listProjects(): Promise<Project[]> {
    return (await kvGet<Project[]>(`${PREFIX}:projects`)) ?? [];
}

export async function getProject(id: string): Promise<Project | null> {
    const projects = await listProjects();
    return projects.find((p) => p.id === id) ?? null;
}

export async function createProject(name: string, description = ''): Promise<Project> {
    const projects = await listProjects();
    const project: Project = {
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name,
        description,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    projects.push(project);
    await kvSet(`${PREFIX}:projects`, projects);
    return project;
}

export async function deleteProject(id: string): Promise<boolean> {
    const projects = await listProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    projects.splice(idx, 1);
    await kvSet(`${PREFIX}:projects`, projects);
    await kvDel(`${PREFIX}:project:${id}:entities`);
    await kvDel(`${PREFIX}:project:${id}:sessions`);
    await kvDel(`${PREFIX}:project:${id}:narrative`);
    return true;
}

export async function updateProject(
    id: string,
    updates: Partial<Pick<Project, 'name' | 'description'>>
): Promise<Project | null> {
    const projects = await listProjects();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    if (updates.name) projects[idx].name = updates.name;
    if (updates.description !== undefined) projects[idx].description = updates.description;
    projects[idx].updatedAt = new Date().toISOString();
    await kvSet(`${PREFIX}:projects`, projects);
    return projects[idx];
}

// --- Entities ---

export async function listEntities(projectId: string): Promise<ProjectEntity[]> {
    return (await kvGet<ProjectEntity[]>(`${PREFIX}:project:${projectId}:entities`)) ?? [];
}

export async function addEntity(
    projectId: string,
    entity: ProjectEntity
): Promise<ProjectEntity[]> {
    const entities = await listEntities(projectId);
    if (entities.some((e) => e.neid === entity.neid)) {
        return entities;
    }
    entities.push(entity);
    await kvSet(`${PREFIX}:project:${projectId}:entities`, entities);
    return entities;
}

export async function addEntitiesBatch(
    projectId: string,
    newEntities: ProjectEntity[]
): Promise<ProjectEntity[]> {
    const entities = await listEntities(projectId);
    for (const ne of newEntities) {
        if (!entities.some((e) => e.neid === ne.neid && ne.neid)) {
            entities.push(ne);
        }
    }
    await kvSet(`${PREFIX}:project:${projectId}:entities`, entities);
    return entities;
}

export async function updateEntity(
    projectId: string,
    neid: string,
    updates: Partial<ProjectEntity>
): Promise<ProjectEntity | null> {
    const entities = await listEntities(projectId);
    const idx = entities.findIndex((e) => e.neid === neid);
    if (idx === -1) return null;
    Object.assign(entities[idx], updates);
    await kvSet(`${PREFIX}:project:${projectId}:entities`, entities);
    return entities[idx];
}

export async function replaceEntities(projectId: string, entities: ProjectEntity[]): Promise<void> {
    await kvSet(`${PREFIX}:project:${projectId}:entities`, entities);
}

export async function removeEntity(projectId: string, neid: string): Promise<ProjectEntity[]> {
    const entities = await listEntities(projectId);
    const filtered = entities.filter((e) => e.neid !== neid);
    await kvSet(`${PREFIX}:project:${projectId}:entities`, filtered);
    return filtered;
}

// --- Scores ---

export async function getEntityScore(projectId: string, neid: string): Promise<EntityScore | null> {
    return kvGet<EntityScore>(`${PREFIX}:project:${projectId}:scores:${neid}`);
}

export async function setEntityScore(projectId: string, score: EntityScore): Promise<void> {
    await kvSet(`${PREFIX}:project:${projectId}:scores:${score.neid}`, score);
}

export async function getAllScores(projectId: string): Promise<EntityScore[]> {
    const entities = await listEntities(projectId);
    const scores: EntityScore[] = [];
    for (const e of entities) {
        const score = await getEntityScore(projectId, e.neid);
        if (score) {
            scores.push(score);
        } else {
            scores.push({
                neid: e.neid,
                fhs: null,
                ers: null,
                fused: null,
                severity: 'pending',
                drivers: [],
                computedAt: '',
            });
        }
    }
    return scores;
}

// --- Assessments ---

export async function saveAssessment(projectId: string, assessment: Assessment): Promise<void> {
    await kvSet(`${PREFIX}:project:${projectId}:assessments:${assessment.neid}`, assessment);
}

export async function getAssessment(projectId: string, neid: string): Promise<Assessment | null> {
    return kvGet<Assessment>(`${PREFIX}:project:${projectId}:assessments:${neid}`);
}

// --- Sessions ---

export async function listSessions(projectId: string): Promise<AgentSession[]> {
    return (await kvGet<AgentSession[]>(`${PREFIX}:project:${projectId}:sessions`)) ?? [];
}

export async function saveSession(projectId: string, session: AgentSession): Promise<void> {
    const sessions = await listSessions(projectId);
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
        sessions[idx] = session;
    } else {
        sessions.push(session);
    }
    if (sessions.length > 100) {
        sessions.splice(0, sessions.length - 100);
    }
    await kvSet(`${PREFIX}:project:${projectId}:sessions`, sessions);
}

// --- Import Sessions ---

export async function listImportSessions(projectId: string): Promise<ImportSession[]> {
    return (await kvGet<ImportSession[]>(`${PREFIX}:project:${projectId}:import_sessions`)) ?? [];
}

export async function getImportSession(
    projectId: string,
    sessionId: string
): Promise<ImportSession | null> {
    const sessions = await listImportSessions(projectId);
    return sessions.find((session) => session.id === sessionId) ?? null;
}

export async function saveImportSession(projectId: string, session: ImportSession): Promise<void> {
    const sessions = await listImportSessions(projectId);
    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
        sessions[idx] = session;
    } else {
        sessions.push(session);
    }
    if (sessions.length > 50) {
        sessions.splice(0, sessions.length - 50);
    }
    await kvSet(`${PREFIX}:project:${projectId}:import_sessions`, sessions);
}

// --- Cache ---

export async function setCachedContext(
    projectId: string,
    neid: string,
    context: unknown
): Promise<void> {
    await kvSet(`${PREFIX}:project:${projectId}:cache:${neid}`, context);
}

export async function getCachedContext(projectId: string, neid: string): Promise<unknown | null> {
    return kvGet(`${PREFIX}:project:${projectId}:cache:${neid}`);
}

// --- Narrative ---

export async function setNarrative(
    projectId: string,
    narrative: { text: string; generatedAt: string; sessionId: string }
): Promise<void> {
    await kvSet(`${PREFIX}:project:${projectId}:narrative`, narrative);
}

export async function getNarrative(
    projectId: string
): Promise<{ text: string; generatedAt: string; sessionId: string } | null> {
    return kvGet(`${PREFIX}:project:${projectId}:narrative`);
}

// --- Research Plans ---

export async function saveResearchPlan(projectId: string, plan: ResearchPlan): Promise<void> {
    const plans = await listResearchPlans(projectId);
    plans.push(plan);
    if (plans.length > 50) plans.splice(0, plans.length - 50);
    await kvSet(`${PREFIX}:project:${projectId}:research_plans`, plans);
}

export async function listResearchPlans(projectId: string): Promise<ResearchPlan[]> {
    return (await kvGet<ResearchPlan[]>(`${PREFIX}:project:${projectId}:research_plans`)) ?? [];
}

// --- Resolution Stats ---

export async function getResolutionStats(projectId: string): Promise<ResolutionStats> {
    const entities = await listEntities(projectId);
    const total = entities.length;
    const resolved = entities.filter((e) => e.resolved).length;
    const idFields = ['cik', 'ticker', 'lei', 'neid', 'figi', 'cusip'] as const;

    const identifierCoverage: Record<string, number> = {};
    for (const field of idFields) {
        const count = entities.filter((e) => {
            if (field === 'neid') return Boolean(e.neid);
            return Boolean(e[field]);
        }).length;
        identifierCoverage[field] = total > 0 ? Math.round((count / total) * 100) : 0;
    }

    const avgConfidence =
        total > 0 ? entities.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / total : 0;
    const avgResolutionStrength =
        total > 0 ? entities.reduce((sum, e) => sum + (e.resolutionStrength ?? 0), 0) / total : 0;

    return {
        total,
        resolved,
        unresolved: total - resolved,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        avgResolutionStrength: Math.round(avgResolutionStrength * 10) / 10,
        identifierCoverage,
    };
}
