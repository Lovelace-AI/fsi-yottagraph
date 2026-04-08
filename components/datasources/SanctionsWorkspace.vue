<template>
    <div class="pa-4">
        <v-tabs v-model="subTab" density="compact" class="mb-4">
            <v-tab value="screening">Screening</v-tab>
            <v-tab value="list">Sanctions List</v-tab>
        </v-tabs>

        <v-window v-model="subTab">
            <v-window-item value="screening">
                <div class="d-flex align-center mb-4">
                    <v-btn
                        color="primary"
                        prepend-icon="mdi-shield-search"
                        size="small"
                        :loading="screening"
                        @click="screenAll"
                    >
                        Screen All Entities
                    </v-btn>
                    <v-spacer />
                    <v-chip v-if="screeningResults.length > 0" variant="tonal" size="small">
                        {{ clearCount }} clear · {{ matchCount }} matches ·
                        {{ pendingCount }} pending
                    </v-chip>
                </div>

                <v-data-table
                    :headers="screeningHeaders"
                    :items="screeningResults"
                    density="comfortable"
                    hover
                >
                    <template #item.status="{ value }">
                        <v-chip
                            :color="
                                value === 'clear' ? 'success' : value === 'match' ? 'error' : 'grey'
                            "
                            size="x-small"
                            variant="tonal"
                        >
                            {{ value }}
                        </v-chip>
                    </template>
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-shield-search"
                            title="No screening results"
                            text="Click 'Screen All Entities' to check project entities against sanctions lists."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="list">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-format-list-bulleted</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Browse the sanctions database. Elemental's knowledge graph contains
                        sanctions data from consolidated screening lists including OFAC SDN.
                    </div>
                    <div class="text-caption text-grey-darken-1 mt-2">
                        Entity types: person, organization with sanctions_id, sanction_program,
                        sanctions_topic properties. Related to sanction_program and country
                        entities.
                    </div>
                </div>
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string; entities: any[] }>();

    const subTab = ref('screening');
    const screening = ref(false);

    const screeningHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Type', key: 'entityType' },
        { title: 'Status', key: 'status' },
        { title: 'NEID', key: 'neid' },
    ];

    const screeningResults = computed(() =>
        props.entities.map((e: any) => ({
            ...e,
            status: 'pending',
        }))
    );

    const clearCount = computed(
        () => screeningResults.value.filter((r) => r.status === 'clear').length
    );
    const matchCount = computed(
        () => screeningResults.value.filter((r) => r.status === 'match').length
    );
    const pendingCount = computed(
        () => screeningResults.value.filter((r) => r.status === 'pending').length
    );

    async function screenAll() {
        screening.value = true;
        await new Promise((r) => setTimeout(r, 1500));
        screening.value = false;
    }
</script>
