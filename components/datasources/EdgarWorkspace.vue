<template>
    <div class="pa-4">
        <v-tabs v-model="subTab" density="compact" class="mb-4">
            <v-tab value="watchlist">Watchlist</v-tab>
            <v-tab value="companies">Companies</v-tab>
            <v-tab value="people">People</v-tab>
            <v-tab value="events">Events</v-tab>
            <v-tab value="filings">Filings</v-tab>
        </v-tabs>

        <v-window v-model="subTab">
            <v-window-item value="watchlist">
                <v-data-table
                    :headers="watchlistHeaders"
                    :items="entityRows"
                    density="comfortable"
                    hover
                    :loading="loading"
                >
                    <template #item.severity="{ value }">
                        <v-chip :color="severityColor(value)" size="x-small" variant="tonal">
                            {{ value }}
                        </v-chip>
                    </template>
                    <template #item.cik="{ value }">
                        <span v-if="value" class="text-caption font-weight-medium">{{
                            value
                        }}</span>
                        <span v-else class="text-grey">—</span>
                    </template>
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-database"
                            title="No entities"
                            text="Add entities to your project to view EDGAR data."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="companies">
                <v-data-table
                    :headers="companyHeaders"
                    :items="orgEntities"
                    density="comfortable"
                    hover
                    :loading="loading"
                >
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-domain"
                            title="No companies"
                            text="Organization entities will appear here."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="people">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-account-group</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        People linked to project entities (officers, directors) will be populated by
                        the History Agent during scans.
                    </div>
                    <div v-if="relatedPeople.length > 0" class="mt-4">
                        <v-list density="compact">
                            <v-list-item v-for="p in relatedPeople" :key="p">
                                <v-list-item-title>{{ p }}</v-list-item-title>
                            </v-list-item>
                        </v-list>
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="events">
                <v-data-table
                    :headers="eventHeaders"
                    :items="events"
                    density="comfortable"
                    hover
                    :loading="eventsLoading"
                >
                    <template #item.type="{ value }">
                        <v-chip size="x-small" variant="tonal">{{ value }}</v-chip>
                    </template>
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-calendar-alert"
                            title="No events"
                            text="Run an agent scan to discover SEC events."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="filings">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-file-document-multiple</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        SEC filings (10-K, 10-Q, 8-K, DEF 14A) are available through the Elemental
                        Knowledge Graph. Run an agent scan to discover filings for your entities.
                    </div>
                    <div class="text-caption text-grey-darken-1 mt-2">
                        Filing types in Elemental: sec::10_k, sec::10_q, sec::8_k, sec::form_4,
                        sec::def_14a, sec::13f_hr
                    </div>
                </div>
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string; entities: any[] }>();

    const subTab = ref('watchlist');
    const loading = ref(false);
    const eventsLoading = ref(false);
    const events = ref<any[]>([]);
    const relatedPeople = ref<string[]>([]);

    const watchlistHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'CIK', key: 'cik' },
        { title: 'Ticker', key: 'ticker' },
        { title: 'Type', key: 'entityType' },
        { title: 'Severity', key: 'severity' },
        { title: 'Match', key: 'matchMethod' },
    ];

    const companyHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'CIK', key: 'cik' },
        { title: 'Ticker', key: 'ticker' },
        { title: 'Confidence', key: 'confidence' },
    ];

    const eventHeaders = [
        { title: 'Entity', key: 'entityName' },
        { title: 'Event', key: 'description' },
        { title: 'Type', key: 'type' },
        { title: 'Date', key: 'date' },
    ];

    const entityRows = computed(() =>
        props.entities.map((e: any) => ({
            ...e,
            severity: e.score?.severity || 'pending',
            cik: e.cik || '—',
            ticker: e.ticker || '—',
            confidence: e.confidence ? `${(e.confidence * 100).toFixed(0)}%` : '—',
        }))
    );

    const orgEntities = computed(() =>
        entityRows.value.filter(
            (e: any) => e.entityType === 'organization' || e.entityType === 'company'
        )
    );

    function severityColor(severity: string): string {
        const c: Record<string, string> = {
            critical: 'error',
            high: 'warning',
            watch: 'info',
            normal: 'success',
            pending: 'grey',
        };
        return c[severity] || 'grey';
    }
</script>
