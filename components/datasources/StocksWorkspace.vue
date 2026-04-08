<template>
    <div class="pa-4">
        <v-tabs v-model="subTab" density="compact" class="mb-4">
            <v-tab value="prices">Price Table</v-tab>
            <v-tab value="cards">Price Cards</v-tab>
            <v-tab value="analytics">Analytics</v-tab>
            <v-tab value="events">Stock Events</v-tab>
            <v-tab value="summary">Market Summary</v-tab>
        </v-tabs>

        <v-window v-model="subTab">
            <v-window-item value="prices">
                <v-data-table
                    :headers="priceHeaders"
                    :items="tickerEntities"
                    density="comfortable"
                    hover
                >
                    <template #item.ticker="{ value }">
                        <v-chip size="small" variant="tonal" color="primary">{{ value }}</v-chip>
                    </template>
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-chart-line"
                            title="No tickers"
                            text="Only entities with resolved ticker symbols appear here. Resolve entities to populate tickers."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="cards">
                <v-row v-if="tickerEntities.length > 0">
                    <v-col
                        v-for="entity in tickerEntities"
                        :key="entity.neid"
                        cols="12"
                        sm="6"
                        md="4"
                    >
                        <v-card>
                            <v-card-title class="d-flex align-center text-subtitle-2">
                                {{ entity.name }}
                                <v-spacer />
                                <v-chip size="x-small" variant="tonal" color="primary">
                                    {{ entity.ticker }}
                                </v-chip>
                            </v-card-title>
                            <v-card-text>
                                <div class="text-caption text-grey">
                                    Stock data available through Elemental financial_instrument
                                    properties: open_price, close_price, trading_volume
                                </div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
                <div v-else class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-chart-box-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2">No entities with tickers.</div>
                </div>
            </v-window-item>

            <v-window-item value="analytics">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-chart-areaspline</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Technical analytics — moving averages, volatility, anomaly flags. Data from
                        Elemental's financial_instrument properties.
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="events">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-alert-circle-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Stock events — anomalies, large price moves, earnings surprises. Detected by
                        the Query Agent during analysis.
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="summary">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-text-box-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2 mb-4">
                        AI-generated market summary across project tickers.
                    </div>
                    <v-btn color="primary" prepend-icon="mdi-creation" size="small" disabled>
                        Generate Market Summary
                    </v-btn>
                </div>
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string; entities: any[] }>();

    const subTab = ref('prices');

    const priceHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Ticker', key: 'ticker' },
        { title: 'Type', key: 'entityType' },
        { title: 'NEID', key: 'neid' },
    ];

    const tickerEntities = computed(() => props.entities.filter((e: any) => e.ticker));
</script>
