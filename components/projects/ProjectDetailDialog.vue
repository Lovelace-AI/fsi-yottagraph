<template>
    <v-dialog :model-value="modelValue" max-width="1100" @update:model-value="updateOpen">
        <v-card>
            <v-card-title class="d-flex align-center">
                <v-icon color="primary" class="mr-2">mdi-folder-outline</v-icon>
                {{ currentProject?.name || 'Project details' }}
                <v-spacer />
                <v-chip v-if="currentProject" variant="tonal" size="small">
                    {{ entities.length }} entit{{ entities.length === 1 ? 'y' : 'ies' }}
                </v-chip>
            </v-card-title>
            <v-card-subtitle v-if="currentProject?.description">
                {{ currentProject.description }}
            </v-card-subtitle>

            <v-card-text>
                <v-alert v-if="!currentProject" type="info" variant="tonal" class="mb-4">
                    Select a project to view details.
                </v-alert>

                <template v-else>
                    <div class="d-flex align-center flex-wrap ga-2 mb-4">
                        <v-btn
                            size="small"
                            variant="outlined"
                            prepend-icon="mdi-file-upload-outline"
                            @click="showCsvImport = true"
                        >
                            Upload CSV
                        </v-btn>
                        <v-btn
                            size="small"
                            variant="outlined"
                            prepend-icon="mdi-creation"
                            @click="showGeminiResearch = true"
                        >
                            Gemini Research
                        </v-btn>
                        <v-btn
                            size="small"
                            variant="text"
                            prepend-icon="mdi-check-all"
                            :loading="resolving"
                            :disabled="entities.length === 0"
                            @click="handleResolve"
                        >
                            Resolve Entities
                        </v-btn>
                        <v-btn
                            size="small"
                            variant="text"
                            prepend-icon="mdi-radar"
                            :loading="scanning"
                            :disabled="entities.length === 0"
                            @click="handleScan"
                        >
                            Run Scan
                        </v-btn>
                        <v-spacer />
                        <v-chip
                            :color="showConflictOnly ? 'warning' : undefined"
                            :variant="showConflictOnly ? 'flat' : 'outlined'"
                            size="small"
                            class="cursor-pointer"
                            @click="showConflictOnly = !showConflictOnly"
                        >
                            {{ conflictCount }} merge conflict{{ conflictCount === 1 ? '' : 's' }}
                        </v-chip>
                        <v-btn color="primary" prepend-icon="mdi-robot" @click="openAgents">
                            Open Agents
                        </v-btn>
                    </div>

                    <v-progress-circular
                        v-if="loading"
                        indeterminate
                        color="primary"
                        class="mb-4"
                    />

                    <v-data-table
                        :headers="entityHeaders"
                        :items="filteredEntities"
                        density="comfortable"
                        hover
                        @click:row="(_: any, { item }: any) => openEntity(item)"
                    >
                        <template #item.ticker="{ value }">
                            <v-chip v-if="value" size="x-small" variant="tonal">{{ value }}</v-chip>
                            <span v-else class="text-grey">—</span>
                        </template>
                        <template #item.fused="{ value }">
                            <span v-if="value !== null" class="font-weight-bold">{{ value }}</span>
                            <span v-else class="text-grey">—</span>
                        </template>
                        <template #item.severity="{ value }">
                            <v-chip :color="severityColor(value)" size="x-small" variant="tonal">
                                {{ value }}
                            </v-chip>
                        </template>
                        <template #item.actions="{ item }">
                            <v-tooltip v-if="item.resolutionNote" location="top">
                                <template #activator="{ props: tooltipProps }">
                                    <v-btn
                                        v-bind="tooltipProps"
                                        size="x-small"
                                        color="warning"
                                        variant="text"
                                        icon="mdi-alert-outline"
                                        @click.stop
                                    />
                                </template>
                                {{ item.resolutionNote }}
                            </v-tooltip>
                            <v-btn
                                size="x-small"
                                variant="text"
                                icon="mdi-eye-outline"
                                @click.stop="openEntity(item)"
                            />
                            <v-btn
                                size="x-small"
                                color="error"
                                variant="text"
                                icon="mdi-close"
                                @click.stop="handleRemove(item.neid)"
                            />
                        </template>
                        <template #no-data>
                            <v-empty-state
                                icon="mdi-domain-off"
                                title="No entities yet"
                                text="Use CSV import or Gemini Research to add entities to this project."
                            />
                        </template>
                    </v-data-table>
                </template>
            </v-card-text>

            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="closeDialog">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>

    <v-dialog v-model="showCsvImport" max-width="700">
        <ProjectsCsvUploadDialog
            v-if="currentProject"
            :project-id="currentProject.id"
            @cancel="showCsvImport = false"
            @imported="handleImported"
        />
    </v-dialog>

    <v-dialog v-model="showGeminiResearch" max-width="700">
        <ProjectsGeminiResearchPanel
            v-if="currentProject"
            :project-id="currentProject.id"
            @cancel="showGeminiResearch = false"
            @imported="handleImported"
        />
    </v-dialog>

    <v-dialog v-model="showEntityDialog" max-width="800">
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

                <div v-if="selectedEntity.drivers?.length">
                    <div class="text-subtitle-2 mb-2">Risk Drivers</div>
                    <v-list density="compact" variant="flat">
                        <v-list-item v-for="(driver, index) in selectedEntity.drivers" :key="index">
                            <template #prepend>
                                <v-chip
                                    :color="driver.lens === 'fhs' ? 'blue' : 'orange'"
                                    size="x-small"
                                    variant="tonal"
                                    class="mr-2"
                                >
                                    {{ driver.lens.toUpperCase() }}
                                </v-chip>
                            </template>
                            <v-list-item-title>{{ driver.signal }}</v-list-item-title>
                            <v-list-item-subtitle>{{ driver.description }}</v-list-item-subtitle>
                        </v-list-item>
                    </v-list>
                </div>

                <v-alert
                    v-if="selectedEntity.resolutionNote"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mt-4"
                >
                    {{ selectedEntity.resolutionNote }}
                </v-alert>

                <div v-if="selectedEntity.instrumentHistory" class="mt-4">
                    <div class="text-subtitle-2 mb-2">Trading Identity History</div>
                    <v-row dense>
                        <v-col cols="12" md="6">
                            <v-card variant="outlined">
                                <v-card-title class="text-body-2">Ticker History</v-card-title>
                                <v-list density="compact">
                                    <v-list-item
                                        v-for="entry in selectedEntity.instrumentHistory
                                            .tickerSymbolHistory"
                                        :key="`ticker-${entry.value}-${entry.effectiveFrom}`"
                                    >
                                        <v-list-item-title>{{ entry.value }}</v-list-item-title>
                                        <v-list-item-subtitle>
                                            {{
                                                formatHistoryRange(
                                                    entry.effectiveFrom,
                                                    entry.lastSeenAt
                                                )
                                            }}
                                        </v-list-item-subtitle>
                                    </v-list-item>
                                </v-list>
                            </v-card>
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-card variant="outlined">
                                <v-card-title class="text-body-2">Exchange History</v-card-title>
                                <v-list density="compact">
                                    <v-list-item
                                        v-for="entry in selectedEntity.instrumentHistory
                                            .exchangeHistory"
                                        :key="`exchange-${entry.value}-${entry.effectiveFrom}`"
                                    >
                                        <v-list-item-title>{{ entry.value }}</v-list-item-title>
                                        <v-list-item-subtitle>
                                            {{
                                                formatHistoryRange(
                                                    entry.effectiveFrom,
                                                    entry.lastSeenAt
                                                )
                                            }}
                                        </v-list-item-subtitle>
                                    </v-list-item>
                                </v-list>
                            </v-card>
                        </v-col>
                    </v-row>

                    <v-card
                        v-if="selectedEntity.instrumentHistory.predecessorInstruments?.length"
                        variant="outlined"
                        class="mt-3"
                    >
                        <v-card-title class="text-body-2">Predecessor Instruments</v-card-title>
                        <v-list density="compact">
                            <v-list-item
                                v-for="entry in selectedEntity.instrumentHistory
                                    .predecessorInstruments"
                                :key="`pred-${entry.neid}`"
                            >
                                <v-list-item-title>
                                    {{ entry.name || entry.neid }}
                                </v-list-item-title>
                                <v-list-item-subtitle>
                                    {{ entry.neid }} ·
                                    {{ formatHistoryRange(entry.effectiveFrom, entry.lastSeenAt) }}
                                </v-list-item-subtitle>
                            </v-list-item>
                        </v-list>
                    </v-card>
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="showEntityDialog = false">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
    interface ProjectSummary {
        id: string;
        name: string;
        description?: string;
    }

    const props = defineProps<{
        modelValue: boolean;
        project?: ProjectSummary | null;
    }>();
    const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

    const router = useRouter();
    const {
        activeProject,
        entities,
        loading,
        refreshEntities,
        removeEntity,
        resolveEntities,
        triggerScan,
    } = useProject();

    const showCsvImport = ref(false);
    const showGeminiResearch = ref(false);
    const showEntityDialog = ref(false);
    const selectedEntity = ref<any>(null);
    const resolving = ref(false);
    const scanning = ref(false);
    const showConflictOnly = ref(false);

    const currentProject = computed(() => {
        if (
            activeProject.value &&
            (!props.project || props.project.id === activeProject.value.id)
        ) {
            return activeProject.value;
        }
        return props.project || activeProject.value;
    });

    const entityHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Ticker', key: 'ticker' },
        { title: 'Type', key: 'entityType' },
        { title: 'Fused', key: 'fused', align: 'center' as const },
        { title: 'Severity', key: 'severity' },
        { title: '', key: 'actions', align: 'end' as const, sortable: false },
    ];

    const enrichedEntities = computed(() =>
        entities.value.map((entity: any) => ({
            ...entity,
            fhs: entity.score?.fhs ?? null,
            ers: entity.score?.ers ?? null,
            fused: entity.score?.fused ?? null,
            severity: entity.score?.severity ?? 'pending',
            drivers: entity.score?.drivers ?? [],
        }))
    );

    const conflictCount = computed(
        () => enrichedEntities.value.filter((entity) => Boolean(entity.resolutionNote)).length
    );

    const filteredEntities = computed(() => {
        if (!showConflictOnly.value) {
            return enrichedEntities.value;
        }
        return enrichedEntities.value.filter((entity) => Boolean(entity.resolutionNote));
    });

    function updateOpen(value: boolean) {
        emit('update:modelValue', value);
        if (!value) {
            showCsvImport.value = false;
            showGeminiResearch.value = false;
            showEntityDialog.value = false;
            selectedEntity.value = null;
        }
    }

    function closeDialog() {
        updateOpen(false);
    }

    async function handleImported() {
        showCsvImport.value = false;
        showGeminiResearch.value = false;
        await refreshEntities();
    }

    async function handleResolve() {
        resolving.value = true;
        await resolveEntities();
        resolving.value = false;
    }

    async function handleScan() {
        scanning.value = true;
        await triggerScan();
        scanning.value = false;
    }

    async function handleRemove(neid: string) {
        await removeEntity(neid);
    }

    function openEntity(item: any) {
        selectedEntity.value = item;
        showEntityDialog.value = true;
    }

    function openAgents() {
        closeDialog();
        router.push('/agents');
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

    function formatHistoryRange(start: string, end: string): string {
        const startLabel = start ? new Date(start).toLocaleDateString() : 'Unknown start';
        const endLabel = end ? new Date(end).toLocaleDateString() : 'Unknown end';
        return startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`;
    }
</script>
