<template>
    <v-app class="theme-brand">
        <template v-if="showAppFramework">
            <v-navigation-drawer permanent app width="220" color="surface">
                <div class="d-flex align-center pa-4 mb-2">
                    <v-icon color="primary" size="24" class="mr-2">mdi-shield-check</v-icon>
                    <span class="text-subtitle-1 font-weight-bold text-primary"
                        >Credit Monitor</span
                    >
                </div>

                <v-divider class="mb-2" />

                <!-- Project Selector -->
                <div class="px-3 mb-2">
                    <v-select
                        :model-value="activeProject?.id || null"
                        :items="projectSelectItems"
                        item-title="name"
                        item-value="id"
                        label="Project"
                        variant="outlined"
                        density="compact"
                        hide-details
                        prepend-inner-icon="mdi-folder-outline"
                        placeholder="Select project..."
                        @update:model-value="handleProjectSwitch"
                    />
                </div>

                <v-list nav density="compact" class="px-2">
                    <v-list-item
                        v-for="item in navItems"
                        :key="item.to"
                        :to="item.to"
                        :prepend-icon="item.icon"
                        :title="item.title"
                        :subtitle="item.subtitle"
                        rounded="lg"
                        class="mb-1"
                    />
                </v-list>

                <template #append>
                    <v-divider class="mb-2" />
                    <v-list nav density="compact" class="px-2">
                        <v-list-item
                            to="/settings"
                            prepend-icon="mdi-cog-outline"
                            title="Settings"
                            rounded="lg"
                        />
                    </v-list>
                    <div class="pa-3">
                        <ServerStatusFooter />
                    </div>
                </template>
            </v-navigation-drawer>

            <v-main class="fill-height">
                <div v-if="route.path !== '/'" class="pa-4 pb-0">
                    <v-alert
                        :type="activeProject ? 'info' : 'warning'"
                        variant="tonal"
                        density="compact"
                    >
                        <div class="d-flex align-center flex-wrap ga-2">
                            <strong>Active project:</strong>
                            <v-chip
                                v-if="activeProject"
                                color="primary"
                                size="small"
                                variant="tonal"
                            >
                                {{ activeProject.name }}
                            </v-chip>
                            <span v-else>No project selected</span>
                            <v-spacer />
                            <span class="text-caption">
                                Agents, Data Explorer, and Dashboard all use this active project.
                            </span>
                        </div>
                    </v-alert>
                </div>
                <NuxtPage />
            </v-main>

            <v-dialog v-model="state.showSettingsDialog" max-width="600">
                <SettingsDialog />
            </v-dialog>

            <NotificationContainer />
        </template>
        <template v-else>
            <NuxtPage />
        </template>
    </v-app>
</template>

<script setup lang="ts">
    import { state } from './utils/appState';

    const route = useRoute();
    const { userName } = useUserState();
    const { projects, activeProject, fetchProjects, selectProject } = useProject();

    const noFrameworkRoutes = ['/login', '/a0callback', '/logout', '/pending'];

    const projectSelectItems = computed(() =>
        projects.value.map((p: any) => ({ id: p.id, name: p.name }))
    );

    async function handleProjectSwitch(projectId: string) {
        const project = projects.value.find((p: any) => p.id === projectId);
        if (project) await selectProject(project);
    }

    onMounted(() => {
        fetchProjects();
    });

    const navItems = [
        {
            to: '/',
            icon: 'mdi-folder-multiple-outline',
            title: 'Projects',
            subtitle: 'Manage entity lists',
        },
        {
            to: '/agents',
            icon: 'mdi-robot-outline',
            title: 'Agents',
            subtitle: 'Pipeline activity',
        },
        {
            to: '/data-sources',
            icon: 'mdi-database-search',
            title: 'Data Sources',
            subtitle: 'EDGAR, News, Stocks...',
        },
        {
            to: '/data-explorer',
            icon: 'mdi-table-search',
            title: 'Data Explorer',
            subtitle: 'Entity views',
        },
        {
            to: '/dashboard',
            icon: 'mdi-chart-areaspline',
            title: 'Dashboard',
            subtitle: 'Risk overview',
        },
    ];

    const showAppFramework = computed(() => {
        if (noFrameworkRoutes.includes(route.path)) {
            return false;
        }
        if (!userName.value) {
            return false;
        }
        return true;
    });
</script>
