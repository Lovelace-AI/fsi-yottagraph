<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-2">
            <PageHeader
                :title="activeProject ? `${activeProject.name} — Dashboard` : 'Dashboard'"
                subtitle="Aggregate risk analytics across project entities"
            />
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-6 pt-2">
            <div v-if="!activeProject" class="text-center pa-12">
                <v-icon size="48" color="grey-darken-1">mdi-folder-alert-outline</v-icon>
                <div class="text-body-1 text-grey mt-2">
                    Select a project from the sidebar Project selector or the
                    <router-link to="/" class="text-primary">Projects</router-link>
                    page first.
                </div>
            </div>

            <template v-else>
                <v-row class="mb-4">
                    <v-col cols="12" sm="3">
                        <v-card>
                            <v-card-text class="text-center">
                                <div class="text-h3 font-weight-bold text-error">
                                    {{ tierCounts.critical }}
                                </div>
                                <div class="text-caption text-grey">Critical</div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                    <v-col cols="12" sm="3">
                        <v-card>
                            <v-card-text class="text-center">
                                <div class="text-h3 font-weight-bold text-warning">
                                    {{ tierCounts.high }}
                                </div>
                                <div class="text-caption text-grey">High</div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                    <v-col cols="12" sm="3">
                        <v-card>
                            <v-card-text class="text-center">
                                <div class="text-h3 font-weight-bold text-info">
                                    {{ tierCounts.watch }}
                                </div>
                                <div class="text-caption text-grey">Watch</div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                    <v-col cols="12" sm="3">
                        <v-card>
                            <v-card-text class="text-center">
                                <div class="text-h3 font-weight-bold text-success">
                                    {{ tierCounts.normal }}
                                </div>
                                <div class="text-caption text-grey">Normal</div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>

                <v-row>
                    <v-col cols="12" md="6">
                        <v-card>
                            <v-card-title class="text-subtitle-1">
                                <v-icon size="18" class="mr-1" color="blue">mdi-chart-bar</v-icon>
                                Financial Health (FHS)
                            </v-card-title>
                            <v-card-text>
                                <div
                                    v-for="entity in topByFhs"
                                    :key="entity.neid"
                                    class="d-flex align-center mb-2"
                                >
                                    <span class="text-body-2 flex-grow-1">{{ entity.name }}</span>
                                    <v-chip
                                        :color="
                                            entity.fhs !== null && entity.fhs >= 60
                                                ? 'error'
                                                : 'grey'
                                        "
                                        size="x-small"
                                        variant="tonal"
                                        class="ml-2"
                                    >
                                        {{ entity.fhs ?? '—' }}
                                    </v-chip>
                                </div>
                                <div
                                    v-if="topByFhs.length === 0"
                                    class="text-center text-grey pa-4"
                                >
                                    No FHS scores yet. Run a scan first.
                                </div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                    <v-col cols="12" md="6">
                        <v-card>
                            <v-card-title class="text-subtitle-1">
                                <v-icon size="18" class="mr-1" color="orange"
                                    >mdi-account-alert</v-icon
                                >
                                Executive Risk (ERS)
                            </v-card-title>
                            <v-card-text>
                                <div
                                    v-for="entity in topByErs"
                                    :key="entity.neid"
                                    class="d-flex align-center mb-2"
                                >
                                    <span class="text-body-2 flex-grow-1">{{ entity.name }}</span>
                                    <v-chip
                                        :color="
                                            entity.ers !== null && entity.ers >= 60
                                                ? 'error'
                                                : 'grey'
                                        "
                                        size="x-small"
                                        variant="tonal"
                                        class="ml-2"
                                    >
                                        {{ entity.ers ?? '—' }}
                                    </v-chip>
                                </div>
                                <div
                                    v-if="topByErs.length === 0"
                                    class="text-center text-grey pa-4"
                                >
                                    No ERS scores yet. Run a scan first.
                                </div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>

                <v-card class="mt-4">
                    <v-card-title class="text-subtitle-1">
                        <v-icon size="18" class="mr-1">mdi-table</v-icon>
                        Entity Risk Table
                    </v-card-title>
                    <v-data-table
                        :headers="riskHeaders"
                        :items="scoredEntities"
                        density="comfortable"
                        hover
                    >
                        <template #item.severity="{ value }">
                            <v-chip :color="severityColor(value)" size="x-small" variant="tonal">
                                {{ value }}
                            </v-chip>
                        </template>
                        <template #item.fused="{ value }">
                            <span v-if="value !== null" class="font-weight-bold">{{ value }}</span>
                            <span v-else class="text-grey">—</span>
                        </template>
                        <template #no-data>
                            <v-empty-state
                                icon="mdi-chart-areaspline"
                                title="No scores"
                                text="Run an agent scan to generate risk scores."
                            />
                        </template>
                    </v-data-table>
                </v-card>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
    const { activeProject, entities } = useProject();

    const riskHeaders = [
        { title: 'Entity', key: 'name' },
        { title: 'Type', key: 'entityType' },
        { title: 'FHS', key: 'fhs', align: 'center' as const },
        { title: 'ERS', key: 'ers', align: 'center' as const },
        { title: 'Fused', key: 'fused', align: 'center' as const },
        { title: 'Severity', key: 'severity' },
    ];

    const scoredEntities = computed(() =>
        entities.value.map((e: any) => ({
            ...e,
            fhs: e.score?.fhs ?? null,
            ers: e.score?.ers ?? null,
            fused: e.score?.fused ?? null,
            severity: e.score?.severity ?? 'pending',
        }))
    );

    const tierCounts = computed(() => {
        const counts = { critical: 0, high: 0, watch: 0, normal: 0 };
        for (const e of scoredEntities.value) {
            if (e.severity in counts) {
                counts[e.severity as keyof typeof counts]++;
            }
        }
        return counts;
    });

    const topByFhs = computed(() =>
        scoredEntities.value
            .filter((e) => e.fhs !== null)
            .sort((a, b) => (b.fhs ?? 0) - (a.fhs ?? 0))
            .slice(0, 5)
    );

    const topByErs = computed(() =>
        scoredEntities.value
            .filter((e) => e.ers !== null)
            .sort((a, b) => (b.ers ?? 0) - (a.ers ?? 0))
            .slice(0, 5)
    );

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
