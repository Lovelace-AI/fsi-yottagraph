/**
 * KV-backed project store for the Credit Monitor.
 *
 * Stores projects, entities, scores, assessments, and agent sessions
 * in Upstash Redis. Falls back to in-memory storage when KV is not
 * configured (local dev).
 */

import { getRedis } from './redis';

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
    addedAt: string;
    addedBy: string;
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

const PREFIX = 'v2';

// In-memory fallback for local dev (when KV is not configured)
const memStore = new Map<string, string>();

async function kvGet<T>(key: string): Promise<T | null> {
    const redis = getRedis();
    if (redis) {
        const val = await redis.get(key);
        if (val === null || val === undefined) return null;
        return typeof val === 'string' ? JSON.parse(val) : (val as T);
    }
    const val = memStore.get(key);
    return val ? JSON.parse(val) : null;
}

async function kvSet(key: string, value: unknown): Promise<void> {
    const redis = getRedis();
    if (redis) {
        await redis.set(key, JSON.stringify(value));
    } else {
        memStore.set(key, JSON.stringify(value));
    }
}

async function kvDel(key: string): Promise<void> {
    const redis = getRedis();
    if (redis) {
        await redis.del(key);
    } else {
        memStore.delete(key);
    }
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
