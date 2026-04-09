<template>
    <v-card>
        <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-file-upload-outline</v-icon>
            CSV Import
            <v-spacer />
            <v-chip size="x-small" variant="tonal">Step {{ step }} of 2</v-chip>
        </v-card-title>

        <v-card-text>
            <!-- Step 1: Upload / Paste -->
            <div v-if="step === 1">
                <v-file-input
                    label="Upload CSV file"
                    accept=".csv,.tsv,.txt"
                    prepend-icon="mdi-paperclip"
                    variant="outlined"
                    density="comfortable"
                    class="mb-4"
                    @update:model-value="handleFileUpload"
                />
                <v-alert
                    v-if="fileLoaded"
                    type="success"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                >
                    File loaded: {{ fileLoaded }} ({{ csvText.split('\n').length }} lines)
                </v-alert>
                <div class="text-center text-body-2 text-grey mb-4">— or paste CSV text —</div>
                <v-textarea
                    v-model="csvText"
                    label="Paste CSV text"
                    placeholder="Any CSV format — Gemini will figure out which columns contain entity names, tickers, CIKs, etc."
                    rows="6"
                    variant="outlined"
                    density="comfortable"
                />
                <div class="text-caption text-grey">
                    No fixed column format required. Gemini analyzes your headers and data to
                    identify entities automatically.
                </div>
            </div>

            <!-- Step 2: Gemini Interpretation + Resolution -->
            <div v-if="step === 2">
                <div v-if="interpreting" class="text-center pa-8">
                    <v-progress-circular indeterminate color="primary" class="mb-4" />
                    <div class="text-body-2 text-grey">
                        Gemini is analyzing your CSV to identify entities...
                    </div>
                </div>
                <div v-else-if="resolving" class="text-center pa-8">
                    <v-progress-circular indeterminate color="primary" class="mb-4" />
                    <div class="text-body-2 text-grey">
                        Resolving {{ preview.entityCount }} entities against Elemental...
                    </div>
                </div>
                <div v-else-if="preview.error" class="text-center pa-8">
                    <v-icon size="48" color="error">mdi-alert-circle</v-icon>
                    <div class="text-body-1 text-error mt-2">{{ preview.error }}</div>
                </div>
                <div v-else>
                    <v-alert
                        v-if="preview.explanation"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mb-4"
                    >
                        {{ preview.explanation }}
                    </v-alert>

                    <div class="d-flex align-center mb-4">
                        <v-chip
                            :color="
                                (preview.resolvedCount ?? 0) > 0
                                    ? 'success'
                                    : preview.entityCount > 0
                                      ? 'warning'
                                      : 'grey'
                            "
                            variant="tonal"
                            size="small"
                        >
                            {{
                                preview.resolvedCount !== undefined
                                    ? `${preview.resolvedCount} / ${preview.entityCount} resolved`
                                    : `${preview.entityCount} entities detected`
                            }}
                        </v-chip>
                        <v-spacer />
                        <v-btn
                            v-if="!preview.resolutionResults"
                            size="small"
                            color="primary"
                            variant="text"
                            prepend-icon="mdi-check-all"
                            :loading="resolving"
                            @click="resolveEntities"
                        >
                            Resolve All
                        </v-btn>
                    </div>

                    <!-- Show detected entities before resolution -->
                    <v-data-table
                        v-if="preview.resolutionResults"
                        :headers="resolutionHeaders"
                        :items="preview.resolutionResults"
                        density="compact"
                        :items-per-page="10"
                    >
                        <template #item.matched="{ value }">
                            <v-icon :color="value ? 'success' : 'error'" size="16">
                                {{ value ? 'mdi-check-circle' : 'mdi-close-circle' }}
                            </v-icon>
                        </template>
                        <template #item.confidence="{ value }">
                            {{ (value * 100).toFixed(0) }}%
                        </template>
                    </v-data-table>
                    <v-data-table
                        v-else
                        :headers="entityPreviewHeaders"
                        :items="preview.entities || []"
                        density="compact"
                        :items-per-page="10"
                    >
                        <template #item.ticker="{ value }">
                            <v-chip v-if="value" size="x-small" variant="tonal">{{ value }}</v-chip>
                            <span v-else class="text-grey">—</span>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </v-card-text>

        <v-card-actions>
            <v-btn v-if="step > 1" variant="text" @click="step = 1">Back</v-btn>
            <v-spacer />
            <v-btn variant="text" @click="$emit('cancel')">Cancel</v-btn>
            <v-btn
                v-if="step === 1"
                color="primary"
                :disabled="!csvText.trim()"
                :loading="interpreting"
                @click="interpretCsv"
            >
                Analyze CSV
            </v-btn>
            <v-btn
                v-if="step === 2 && !preview.resolutionResults && preview.entityCount > 0"
                color="primary"
                :loading="resolving"
                @click="resolveEntities"
            >
                Resolve {{ preview.entityCount }} Entities
            </v-btn>
            <v-btn
                v-if="step === 2 && preview.resolutionResults"
                color="primary"
                :loading="importing"
                @click="importEntities"
            >
                Import {{ preview.resolvedCount ?? preview.entityCount }} Entities
            </v-btn>
        </v-card-actions>
    </v-card>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string }>();
    const emit = defineEmits<{ cancel: []; imported: [count: number] }>();

    const step = ref(1);
    const csvText = ref('');
    const fileLoaded = ref('');
    const preview = ref<any>({});
    const interpreting = ref(false);
    const resolving = ref(false);
    const importing = ref(false);

    const resolutionHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Matched', key: 'matched', align: 'center' as const },
        { title: 'Method', key: 'matchMethod' },
        { title: 'Confidence', key: 'confidence', align: 'center' as const },
        { title: 'IDs', key: 'resolutionStrength', align: 'center' as const },
    ];

    const entityPreviewHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Ticker', key: 'ticker' },
        { title: 'CIK', key: 'cik' },
        { title: 'LEI', key: 'lei' },
        { title: 'Identifiers', key: 'idCount', align: 'center' as const },
    ];

    async function handleFileUpload(files: File | File[] | null) {
        if (!files) return;
        const f = Array.isArray(files) ? files[0] : files;
        if (!f) return;
        csvText.value = await f.text();
        fileLoaded.value = f.name;
    }

    async function interpretCsv() {
        if (!csvText.value.trim()) return;
        interpreting.value = true;
        step.value = 2;
        try {
            preview.value = await $fetch(`/api/v2/projects/${props.projectId}/csv-preview`, {
                method: 'POST',
                body: { csvText: csvText.value },
                timeout: 60000,
            });
        } catch (e: any) {
            preview.value = { error: e.data?.statusMessage || 'CSV analysis failed' };
        }
        interpreting.value = false;
    }

    async function resolveEntities() {
        resolving.value = true;
        try {
            preview.value = await $fetch(`/api/v2/projects/${props.projectId}/csv-preview`, {
                method: 'POST',
                body: { csvText: csvText.value, resolve: true },
                timeout: 120000,
            });
        } catch (e: any) {
            preview.value = {
                ...preview.value,
                error: e.data?.statusMessage || 'Resolution failed',
            };
        }
        resolving.value = false;
    }

    async function importEntities() {
        importing.value = true;
        try {
            const entitiesToImport = preview.value.allEntities || preview.value.entities || [];
            const batch = entitiesToImport.map((e: any) => ({
                name: e.name,
                ticker: e.ticker,
                cik: e.cik,
                lei: e.lei,
                ein: e.ein,
                cusip: e.cusip,
                figi: e.figi,
                isin: e.isin,
            }));
            await $fetch(`/api/v2/projects/${props.projectId}/entities`, {
                method: 'POST',
                body: { batch, sourceType: 'csv' },
                timeout: 120000,
            });
            emit('imported', batch.length);
        } catch {
            // handled by parent
        }
        importing.value = false;
    }
</script>
