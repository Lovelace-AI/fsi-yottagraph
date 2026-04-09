<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-0">
            <PageHeader
                :title="activeProject ? `${activeProject.name} — Data Explorer` : 'Data Explorer'"
                subtitle="View project entities through five analytical lenses"
            />

            <v-tabs v-model="tab" color="primary" density="compact" class="mt-2">
                <v-tab value="table">
                    <v-icon size="16" class="mr-1">mdi-table</v-icon>
                    Table
                </v-tab>
                <v-tab value="graph">
                    <v-icon size="16" class="mr-1">mdi-graph-outline</v-icon>
                    Graph
                </v-tab>
                <v-tab value="timeline">
                    <v-icon size="16" class="mr-1">mdi-timeline</v-icon>
                    Timeline
                </v-tab>
                <v-tab value="narrative">
                    <v-icon size="16" class="mr-1">mdi-text-box-outline</v-icon>
                    Narrative
                </v-tab>
            </v-tabs>
        </div>

        <v-divider />

        <div class="flex-grow-1 overflow-y-auto">
            <v-window v-model="tab">
                <v-window-item value="table">
                    <div class="pa-4">
                        <div v-if="!activeProject" class="text-center pa-12">
                            <v-icon size="48" color="grey-darken-1"
                                >mdi-folder-alert-outline</v-icon
                            >
                            <div class="text-body-1 text-grey mt-2">
                                Select a project from the sidebar Project selector or the
                                <router-link to="/" class="text-primary">Projects</router-link>
                                page first.
                            </div>
                        </div>
                        <v-data-table
                            v-else
                            :headers="tableHeaders"
                            :items="enrichedEntities"
                            density="comfortable"
                            hover
                            @click:row="(_: any, { item }: any) => openModal(item)"
                        >
                            <template #item.severity="{ value }">
                                <v-chip
                                    :color="severityColor(value)"
                                    size="x-small"
                                    variant="tonal"
                                >
                                    {{ value }}
                                </v-chip>
                            </template>
                            <template #item.fused="{ value }">
                                <span v-if="value !== null" class="font-weight-bold">
                                    {{ value }}
                                </span>
                                <span v-else class="text-grey">—</span>
                            </template>
                            <template #item.fhs="{ value }">
                                <span v-if="value !== null">{{ value }}</span>
                                <span v-else class="text-grey">—</span>
                            </template>
                            <template #item.ers="{ value }">
                                <span v-if="value !== null">{{ value }}</span>
                                <span v-else class="text-grey">—</span>
                            </template>
                            <template #no-data>
                                <v-empty-state
                                    icon="mdi-table-off"
                                    title="No entities"
                                    text="Add entities to your project from the Agents page."
                                />
                            </template>
                        </v-data-table>
                    </div>
                </v-window-item>

                <v-window-item value="graph">
                    <div class="pa-4 text-center" style="min-height: 400px">
                        <v-icon size="48" color="grey-darken-1" class="mt-12"
                            >mdi-graph-outline</v-icon
                        >
                        <div class="text-body-1 text-grey mt-2">
                            Network graph visualization — coming in Stage 4
                        </div>
                        <div class="text-caption text-grey-darken-1">
                            Sigma v3 + Graphology with ForceAtlas2 layout
                        </div>
                    </div>
                </v-window-item>

                <v-window-item value="timeline">
                    <div class="pa-4 text-center" style="min-height: 400px">
                        <v-icon size="48" color="grey-darken-1" class="mt-12">mdi-timeline</v-icon>
                        <div class="text-body-1 text-grey mt-2">
                            Event timeline — coming in Stage 4
                        </div>
                        <div class="text-caption text-grey-darken-1">
                            Vertical timeline of agent-discovered events
                        </div>
                    </div>
                </v-window-item>

                <v-window-item value="narrative">
                    <div class="pa-4 text-center" style="min-height: 400px">
                        <v-icon size="48" color="grey-darken-1" class="mt-12"
                            >mdi-text-box-outline</v-icon
                        >
                        <div class="text-body-1 text-grey mt-2">
                            Agent-generated narrative — coming in Stage 4
                        </div>
                        <div class="text-caption text-grey-darken-1">
                            Evidence-backed narrative report from the Query Agent
                        </div>
                    </div>
                </v-window-item>
            </v-window>
        </div>

        <v-dialog v-model="showModal" max-width="800">
            <v-card v-if="selectedEntity">
                <v-card-title class="d-flex align-center">
                    <v-icon color="primary" class="mr-2">mdi-domain</v-icon>
                    {{ selectedEntity.name }}
                    <v-spacer />
                    <v-chip
                        v-if="selectedEntity.severity"
                        :color="severityColor(selectedEntity.severity)"
                        size="small"
                        variant="tonal"
                    >
                        {{ selectedEntity.severity }}
                    </v-chip>
                </v-card-title>
                <v-card-subtitle>
                    {{ selectedEntity.entityType }} · NEID: {{ selectedEntity.neid }}
                </v-card-subtitle>
                <v-card-text>
                    <v-row class="mb-4">
                        <v-col cols="4">
                            <div class="text-caption text-grey">FHS Score</div>
                            <div class="text-h5">{{ selectedEntity.fhs ?? '—' }}</div>
                        </v-col>
                        <v-col cols="4">
                            <div class="text-caption text-grey">ERS Score</div>
                            <div class="text-h5">{{ selectedEntity.ers ?? '—' }}</div>
                        </v-col>
                        <v-col cols="4">
                            <div class="text-caption text-grey">Fused Score</div>
                            <div class="text-h5 font-weight-bold">
                                {{ selectedEntity.fused ?? '—' }}
                            </div>
                        </v-col>
                    </v-row>

                    <div v-if="selectedEntity.drivers?.length" class="mb-4">
                        <div class="text-subtitle-2 mb-2">Risk Drivers</div>
                        <v-list density="compact" variant="flat">
                            <v-list-item v-for="(d, i) in selectedEntity.drivers" :key="i">
                                <template #prepend>
                                    <v-chip
                                        :color="d.lens === 'fhs' ? 'blue' : 'orange'"
                                        size="x-small"
                                        variant="tonal"
                                        class="mr-2"
                                    >
                                        {{ d.lens.toUpperCase() }}
                                    </v-chip>
                                </template>
                                <v-list-item-title>{{ d.signal }}</v-list-item-title>
                                <v-list-item-subtitle>{{ d.description }}</v-list-item-subtitle>
                            </v-list-item>
                        </v-list>
                    </div>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="showModal = false">Close</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
    const { activeProject, entities } = useProject();

    const tab = ref('table');
    const showModal = ref(false);
    const selectedEntity = ref<any>(null);

    const tableHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Type', key: 'entityType' },
        { title: 'FHS', key: 'fhs', align: 'center' as const },
        { title: 'ERS', key: 'ers', align: 'center' as const },
        { title: 'Fused', key: 'fused', align: 'center' as const },
        { title: 'Severity', key: 'severity' },
    ];

    const enrichedEntities = computed(() =>
        entities.value.map((e: any) => ({
            ...e,
            fhs: e.score?.fhs ?? null,
            ers: e.score?.ers ?? null,
            fused: e.score?.fused ?? null,
            severity: e.score?.severity ?? 'pending',
            drivers: e.score?.drivers ?? [],
        }))
    );

    function openModal(item: any) {
        selectedEntity.value = item;
        showModal.value = true;
    }

    function severityColor(severity: string): string {
        const colors: Record<string, string> = {
            critical: 'error',
            high: 'warning',
            watch: 'info',
            normal: 'success',
            pending: 'grey',
        };
        return colors[severity] || 'grey';
    }
</script>
