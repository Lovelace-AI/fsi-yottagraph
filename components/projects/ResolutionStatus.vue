<template>
    <v-card variant="outlined">
        <v-card-title class="text-subtitle-1 d-flex align-center">
            <v-icon size="18" class="mr-1">mdi-check-decagram</v-icon>
            Resolution Status
            <v-spacer />
            <v-btn size="x-small" variant="text" prepend-icon="mdi-refresh" @click="refresh">
                Re-resolve
            </v-btn>
        </v-card-title>

        <v-card-text v-if="stats">
            <div class="d-flex align-center mb-3">
                <div class="text-body-2 mr-3">
                    {{ stats.resolved }} / {{ stats.total }} resolved ({{
                        stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0
                    }}%)
                </div>
                <v-progress-linear
                    :model-value="stats.total > 0 ? (stats.resolved / stats.total) * 100 : 0"
                    color="primary"
                    rounded
                    height="8"
                    class="flex-grow-1"
                />
            </div>

            <div class="d-flex flex-wrap ga-2 mb-4">
                <v-chip
                    v-for="(pct, idType) in stats.identifierCoverage"
                    :key="idType"
                    :color="pct > 75 ? 'success' : pct > 25 ? 'warning' : 'grey'"
                    size="small"
                    variant="tonal"
                >
                    {{ String(idType).toUpperCase() }} {{ pct }}%
                </v-chip>
            </div>

            <div class="text-caption text-grey">
                Avg Resolution Strength: {{ stats.avgResolutionStrength }} IDs/entity · Avg
                Confidence: {{ (stats.avgConfidence * 100).toFixed(0) }}%
            </div>

            <v-data-table
                v-if="entities.length > 0"
                :headers="headers"
                :items="entityRows"
                density="compact"
                class="mt-4"
                :items-per-page="10"
            >
                <template #item.resolved="{ value }">
                    <v-icon :color="value ? 'success' : 'error'" size="16">
                        {{ value ? 'mdi-check-circle' : 'mdi-close-circle' }}
                    </v-icon>
                </template>
                <template #item.confidence="{ value }"> {{ (value * 100).toFixed(0) }}% </template>
                <template #item.identifiers="{ item }">
                    <v-chip v-if="item.cik" size="x-small" variant="tonal" class="mr-1">CIK</v-chip>
                    <v-chip v-if="item.ticker" size="x-small" variant="tonal" class="mr-1">
                        {{ item.ticker }}
                    </v-chip>
                    <v-chip v-if="item.lei" size="x-small" variant="tonal" class="mr-1">LEI</v-chip>
                    <v-chip v-if="item.neid" size="x-small" variant="tonal" class="mr-1"
                        >NEID</v-chip
                    >
                </template>
            </v-data-table>
        </v-card-text>

        <v-card-text v-else class="text-center pa-8">
            <v-progress-circular v-if="loading" indeterminate color="primary" />
            <div v-else class="text-body-2 text-grey">No entities to show.</div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string }>();

    const stats = ref<any>(null);
    const entities = ref<any[]>([]);
    const loading = ref(false);

    const headers = [
        { title: 'Name', key: 'name' },
        { title: 'Resolved', key: 'resolved', align: 'center' as const },
        { title: 'Method', key: 'matchMethod' },
        { title: 'Confidence', key: 'confidence', align: 'center' as const },
        { title: 'Identifiers', key: 'identifiers' },
    ];

    const entityRows = computed(() =>
        entities.value.map((e) => ({
            ...e,
            identifiers: e,
        }))
    );

    async function fetchStats() {
        loading.value = true;
        try {
            const [s, e] = await Promise.all([
                $fetch(`/api/v2/projects/${props.projectId}/resolution-status`),
                $fetch<any[]>(`/api/v2/projects/${props.projectId}/entities`),
            ]);
            stats.value = s;
            entities.value = e;
        } catch {
            stats.value = null;
        }
        loading.value = false;
    }

    async function refresh() {
        loading.value = true;
        try {
            await $fetch(`/api/v2/projects/${props.projectId}/resolve`, {
                method: 'POST',
            });
            await fetchStats();
        } catch {
            // handled
        }
        loading.value = false;
    }

    onMounted(fetchStats);
</script>
