/**
 * Composable for managing the active project and its entities.
 *
 * Handles project CRUD, entity management, and provides reactive state
 * for the current project across all pages. Persists the active project
 * to localStorage for auto-restore on page reload.
 */

import { ref, computed, readonly } from 'vue';

interface Project {
    id: string;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

interface ProjectEntity {
    neid: string;
    name: string;
    entityType: string;
    cik?: string;
    ticker?: string;
    lei?: string;
    matchMethod?: string;
    confidence?: number;
    resolutionStrength?: number;
    sourceType?: string;
    resolved?: boolean;
    rationale?: string;
    addedAt: string;
    addedBy: string;
    score?: EntityScore | null;
}

interface EntityScore {
    neid: string;
    fhs: number | null;
    ers: number | null;
    fused: number | null;
    severity: 'critical' | 'high' | 'watch' | 'normal' | 'pending';
    drivers: { lens: string; signal: string; description: string }[];
    computedAt: string;
}

interface ResolutionStats {
    total: number;
    resolved: number;
    unresolved: number;
    avgConfidence: number;
    avgResolutionStrength: number;
    identifierCoverage: Record<string, number>;
}

const projects = ref<Project[]>([]);
const activeProject = ref<Project | null>(null);
const entities = ref<ProjectEntity[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const initialized = ref(false);

const STORAGE_KEY = 'credit-monitor:activeProjectId';

function persistProjectId(id: string | null): void {
    try {
        if (id) localStorage.setItem(STORAGE_KEY, id);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // localStorage unavailable (SSR, private browsing)
    }
}

function getPersistedProjectId(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

export function useProject() {
    async function fetchProjects(): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            projects.value = await $fetch<Project[]>('/api/v2/projects');

            if (!activeProject.value && !initialized.value) {
                const savedId = getPersistedProjectId();
                if (savedId) {
                    const saved = projects.value.find((p) => p.id === savedId);
                    if (saved) await selectProject(saved);
                }
            }
            initialized.value = true;
        } catch (e: any) {
            error.value = e.message || 'Failed to fetch projects';
        } finally {
            loading.value = false;
        }
    }

    async function createProject(name: string, description = ''): Promise<Project | null> {
        try {
            const project = await $fetch<Project>('/api/v2/projects', {
                method: 'POST',
                body: { name, description },
            });
            projects.value.push(project);
            return project;
        } catch (e: any) {
            error.value = e.message || 'Failed to create project';
            return null;
        }
    }

    async function selectProject(project: Project): Promise<void> {
        activeProject.value = project;
        persistProjectId(project.id);
        loading.value = true;
        try {
            const data = await $fetch<ProjectEntity[]>(`/api/v2/projects/${project.id}/entities`);
            entities.value = data;
        } catch (e: any) {
            error.value = e.message || 'Failed to load entities';
            entities.value = [];
        } finally {
            loading.value = false;
        }
    }

    async function deleteProject(id: string): Promise<void> {
        try {
            await $fetch(`/api/v2/projects/${id}`, { method: 'DELETE' });
            projects.value = projects.value.filter((p) => p.id !== id);
            if (activeProject.value?.id === id) {
                activeProject.value = null;
                entities.value = [];
                persistProjectId(null);
            }
        } catch (e: any) {
            error.value = e.message || 'Failed to delete project';
        }
    }

    async function addEntity(name: string): Promise<ProjectEntity | null> {
        if (!activeProject.value) return null;
        try {
            const res = await $fetch<{ entity: ProjectEntity; entities: ProjectEntity[] }>(
                `/api/v2/projects/${activeProject.value.id}/entities`,
                { method: 'POST', body: { name } }
            );
            entities.value = res.entities;
            return res.entity;
        } catch (e: any) {
            error.value = e.data?.statusMessage || e.message || 'Failed to add entity';
            return null;
        }
    }

    async function removeEntity(neid: string): Promise<void> {
        if (!activeProject.value) return;
        try {
            const res = await $fetch<{ entities: ProjectEntity[] }>(
                `/api/v2/projects/${activeProject.value.id}/entities`,
                { method: 'DELETE', body: { neid } }
            );
            entities.value = res.entities;
        } catch (e: any) {
            error.value = e.message || 'Failed to remove entity';
        }
    }

    async function refreshEntities(): Promise<void> {
        if (!activeProject.value) return;
        try {
            entities.value = await $fetch<ProjectEntity[]>(
                `/api/v2/projects/${activeProject.value.id}/entities`
            );
        } catch {
            // silent
        }
    }

    async function triggerScan(): Promise<void> {
        if (!activeProject.value) return;
        loading.value = true;
        try {
            await $fetch(`/api/v2/projects/${activeProject.value.id}/scan`, {
                method: 'POST',
            });
            await refreshEntities();
        } catch (e: any) {
            error.value = e.message || 'Scan failed';
        } finally {
            loading.value = false;
        }
    }

    async function resolveEntities(entityNeids?: string[]): Promise<void> {
        if (!activeProject.value) return;
        loading.value = true;
        try {
            const res = await $fetch<{ entities: ProjectEntity[] }>(
                `/api/v2/projects/${activeProject.value.id}/resolve`,
                { method: 'POST', body: { entityNeids } }
            );
            entities.value = res.entities;
        } catch (e: any) {
            error.value = e.message || 'Resolution failed';
        } finally {
            loading.value = false;
        }
    }

    async function getResolutionStats(): Promise<ResolutionStats | null> {
        if (!activeProject.value) return null;
        try {
            return await $fetch<ResolutionStats>(
                `/api/v2/projects/${activeProject.value.id}/resolution-status`
            );
        } catch {
            return null;
        }
    }

    const currentProjectId = computed(() => activeProject.value?.id || null);
    const entityCount = computed(() => entities.value.length);
    const resolvedCount = computed(() => entities.value.filter((e) => e.resolved).length);

    return {
        projects: readonly(projects),
        activeProject: readonly(activeProject),
        currentProjectId,
        entities: readonly(entities),
        loading: readonly(loading),
        error: readonly(error),
        entityCount,
        resolvedCount,
        fetchProjects,
        createProject,
        selectProject,
        deleteProject,
        addEntity,
        removeEntity,
        refreshEntities,
        triggerScan,
        resolveEntities,
        getResolutionStats,
    };
}
