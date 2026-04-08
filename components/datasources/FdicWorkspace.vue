<template>
    <div class="pa-4">
        <v-tabs v-model="subTab" density="compact" class="mb-4">
            <v-tab value="institutions">Institutions</v-tab>
            <v-tab value="financials">Financials</v-tab>
            <v-tab value="failures">Failures</v-tab>
            <v-tab value="events">FDIC Events</v-tab>
        </v-tabs>

        <v-window v-model="subTab">
            <v-window-item value="institutions">
                <v-data-table
                    :headers="institutionHeaders"
                    :items="entityRows"
                    density="comfortable"
                    hover
                >
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-bank"
                            title="No banking entities"
                            text="Add banking institutions to your project to view FDIC data. Elemental's knowledge graph contains FDIC institution data including certificate numbers and regulatory status."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="financials">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-chart-bar</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        FDIC financial data for banking institutions: total_assets, total_deposits,
                        total_liabilities, shareholders_equity, net_income, ROA, ROE, NIM, and more.
                    </div>
                    <div class="text-caption text-grey-darken-1 mt-2">
                        Available through Elemental's organization properties (fdic source)
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="failures">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-alert-decagram</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Failed bank records from FDIC. Includes failure_date,
                        failure_resolution_type, failure_estimated_loss, and acquiring institution
                        (acquired_by relationship).
                    </div>
                    <div class="text-caption text-grey-darken-1 mt-2">
                        Source: fdic_failure in Elemental knowledge graph
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="events">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-calendar-alert</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        FDIC events: bank failures, mergers, acquisitions, charter changes.
                        Discovered through entity relationships and FDIC properties.
                    </div>
                </div>
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string; entities: any[] }>();

    const subTab = ref('institutions');

    const institutionHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'CIK', key: 'cik' },
        { title: 'Ticker', key: 'ticker' },
        { title: 'Type', key: 'entityType' },
        { title: 'Confidence', key: 'confidenceLabel' },
    ];

    const entityRows = computed(() =>
        props.entities.map((e: any) => ({
            ...e,
            cik: e.cik || '—',
            ticker: e.ticker || '—',
            confidenceLabel: e.confidence ? `${(e.confidence * 100).toFixed(0)}%` : '—',
        }))
    );
</script>
