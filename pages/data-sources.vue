<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-0">
            <PageHeader
                :title="activeProject ? `${activeProject.name} — Data Sources` : 'Data Sources'"
                subtitle="Explore entity data across integrated sources"
            />

            <v-tabs v-model="tab" color="primary" density="compact" class="mt-2" show-arrows>
                <v-tab v-for="src in sources" :key="src.id" :value="src.id">
                    <v-icon size="16" class="mr-1">{{ src.icon }}</v-icon>
                    {{ src.name }}
                </v-tab>
            </v-tabs>
        </div>

        <v-divider />

        <div class="flex-grow-1 overflow-y-auto">
            <div v-if="!activeProject" class="text-center pa-12">
                <v-icon size="48" color="grey-darken-1">mdi-folder-alert-outline</v-icon>
                <div class="text-body-1 text-grey mt-2">
                    Select a project from the
                    <router-link to="/" class="text-primary">Projects</router-link>
                    page to browse data sources.
                </div>
            </div>
            <template v-else>
                <KeepAlive>
                    <component
                        :is="activeWorkspace"
                        :project-id="activeProject.id"
                        :entities="entities"
                    />
                </KeepAlive>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
    import EdgarWorkspace from '~/components/datasources/EdgarWorkspace.vue';
    import NewsWorkspace from '~/components/datasources/NewsWorkspace.vue';
    import StocksWorkspace from '~/components/datasources/StocksWorkspace.vue';
    import PolymarketWorkspace from '~/components/datasources/PolymarketWorkspace.vue';
    import FdicWorkspace from '~/components/datasources/FdicWorkspace.vue';
    import SanctionsWorkspace from '~/components/datasources/SanctionsWorkspace.vue';

    const { activeProject, entities } = useProject();

    const tab = ref('edgar');

    const sources = [
        { id: 'edgar', name: 'EDGAR', icon: 'mdi-database' },
        { id: 'news', name: 'News', icon: 'mdi-newspaper-variant-outline' },
        { id: 'stocks', name: 'Stocks', icon: 'mdi-chart-line' },
        { id: 'polymarket', name: 'Polymarket', icon: 'mdi-chart-timeline-variant' },
        { id: 'fdic', name: 'FDIC', icon: 'mdi-bank' },
        { id: 'sanctions', name: 'Sanctions', icon: 'mdi-shield-search' },
    ];

    const workspaceMap: Record<string, any> = {
        edgar: EdgarWorkspace,
        news: NewsWorkspace,
        stocks: StocksWorkspace,
        polymarket: PolymarketWorkspace,
        fdic: FdicWorkspace,
        sanctions: SanctionsWorkspace,
    };

    const activeWorkspace = computed(() => workspaceMap[tab.value] || EdgarWorkspace);
</script>
