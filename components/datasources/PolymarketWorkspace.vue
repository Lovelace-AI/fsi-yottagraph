<template>
    <div class="pa-4">
        <v-tabs v-model="subTab" density="compact" class="mb-4">
            <v-tab value="entities">Entities</v-tab>
            <v-tab value="markets">Markets</v-tab>
            <v-tab value="events">Market Events</v-tab>
            <v-tab value="summary">Summary</v-tab>
        </v-tabs>

        <v-window v-model="subTab">
            <v-window-item value="entities">
                <v-data-table
                    :headers="entityHeaders"
                    :items="entityRows"
                    density="comfortable"
                    hover
                >
                    <template #item.neidStatus="{ value }">
                        <v-icon :color="value ? 'success' : 'warning'" size="16">
                            {{ value ? 'mdi-check-circle' : 'mdi-alert-circle' }}
                        </v-icon>
                    </template>
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-chart-timeline-variant"
                            title="No entities"
                            text="Add entities with NEIDs to discover linked prediction markets."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="markets">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-chart-timeline-variant</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Prediction markets linked to project entities. Elemental's knowledge graph
                        contains prediction_event, prediction_market, and prediction_series entities
                        from Polymarket.
                    </div>
                    <div class="text-caption text-grey-darken-1 mt-2">
                        Key properties: polymarket_id, category, outcome_prices, sentiment, trading
                        volume, liquidity
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="events">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-bell-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Significant market movements and resolution events. Tracked when prediction
                        market probabilities cross thresholds.
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="summary">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-creation</v-icon>
                    <div class="text-body-1 text-grey mt-2 mb-4">
                        AI-generated prediction market signal summary.
                    </div>
                    <v-btn color="primary" prepend-icon="mdi-creation" size="small" disabled>
                        Generate Prediction Summary
                    </v-btn>
                </div>
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string; entities: any[] }>();

    const subTab = ref('entities');

    const entityHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'NEID', key: 'neidStatus', align: 'center' as const },
        { title: 'Type', key: 'entityType' },
        { title: 'Entity ID', key: 'neid' },
    ];

    const entityRows = computed(() =>
        props.entities.map((e: any) => ({
            ...e,
            neidStatus: Boolean(e.neid && !e.neid.startsWith('unresolved')),
        }))
    );
</script>
