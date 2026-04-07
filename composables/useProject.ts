/**
 * Composable for managing the active project and its entities.
 *
 * Handles project CRUD, entity management, and provides reactive state
 * for the current project across all pages.
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

const projects = ref<Project[]>([]);
const activeProject = ref<Project | null>(null);
const entities = ref<ProjectEntity[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

export function useProject() {
    async function fetchProjects(): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            projects.value = await $fetch<Project[]>('/api/v2/projects');
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
            // silent refresh failure
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

    return {
        projects: readonly(projects),
        activeProject: readonly(activeProject),
        entities: readonly(entities),
        loading: readonly(loading),
        error: readonly(error),
        fetchProjects,
        createProject,
        selectProject,
        deleteProject,
        addEntity,
        removeEntity,
        refreshEntities,
        triggerScan,
    };
}
