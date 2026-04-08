<template>
    <v-card>
        <v-card-title class="d-flex align-center">
            <v-icon class="mr-2">mdi-file-upload-outline</v-icon>
            CSV Import
            <v-spacer />
            <v-chip size="x-small" variant="tonal">Step {{ step }} of 3</v-chip>
        </v-card-title>

        <v-card-text>
            <!-- Step 1: Upload / Paste -->
            <div v-if="step === 1">
                <v-file-input
                    v-model="file"
                    label="Upload CSV file"
                    accept=".csv,.tsv,.txt"
                    prepend-icon="mdi-paperclip"
                    variant="outlined"
                    density="comfortable"
                    class="mb-4"
                    @update:model-value="handleFileUpload"
                />
                <div class="text-center text-body-2 text-grey mb-4">— or paste CSV text —</div>
                <v-textarea
                    v-model="csvText"
                    label="Paste CSV text"
                    placeholder="Name,Ticker,CIK&#10;Apple Inc,AAPL,320193&#10;Microsoft Corp,MSFT,789019"
                    rows="6"
                    variant="outlined"
                    density="comfortable"
                />
            </div>

            <!-- Step 2: Column Mapping -->
            <div v-if="step === 2">
                <div class="text-body-2 text-grey mb-4">
                    {{ preview.entityCount }} rows detected. Map columns to entity fields:
                </div>
                <v-row v-for="(col, i) in columnMappings" :key="i" dense class="mb-1">
                    <v-col cols="5">
                        <v-chip variant="outlined" size="small">{{ col.header }}</v-chip>
                    </v-col>
                    <v-col cols="1" class="d-flex align-center justify-center">
                        <v-icon size="16">mdi-arrow-right</v-icon>
                    </v-col>
                    <v-col cols="6">
                        <v-select
                            v-model="col.mapping"
                            :items="mappingOptions"
                            item-title="label"
                            item-value="value"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                </v-row>

                <v-card v-if="preview.sampleRows?.length" variant="tonal" class="mt-4 pa-2">
                    <div class="text-caption text-grey mb-1">Sample data (first 3 rows)</div>
                    <div
                        v-for="(row, i) in preview.sampleRows.slice(0, 3)"
                        :key="i"
                        class="text-caption"
                    >
                        {{ row.join(' | ') }}
                    </div>
                </v-card>
            </div>

            <!-- Step 3: Resolution Preview -->
            <div v-if="step === 3">
                <div v-if="resolving" class="text-center pa-8">
                    <v-progress-circular indeterminate color="primary" class="mb-4" />
                    <div class="text-body-2 text-grey">
                        Resolving {{ preview.entityCount }} entities against Elemental...
                    </div>
                </div>
                <div v-else>
                    <div class="d-flex align-center mb-4">
                        <v-chip
                            :color="preview.resolvedCount > 0 ? 'success' : 'warning'"
                            variant="tonal"
                            size="small"
                        >
                            {{ preview.resolvedCount ?? 0 }} / {{ preview.entityCount }} resolved
                        </v-chip>
                    </div>
                    <v-data-table
                        v-if="preview.resolutionResults?.length"
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
                </div>
            </div>
        </v-card-text>

        <v-card-actions>
            <v-btn v-if="step > 1" variant="text" @click="step--">Back</v-btn>
            <v-spacer />
            <v-btn variant="text" @click="$emit('cancel')">Cancel</v-btn>
            <v-btn
                v-if="step === 1"
                color="primary"
                :disabled="!csvText.trim()"
                @click="parseAndPreview"
            >
                Next
            </v-btn>
            <v-btn v-if="step === 2" color="primary" :loading="resolving" @click="resolvePreview">
                Resolve {{ preview.entityCount }} Entities
            </v-btn>
            <v-btn
                v-if="step === 3"
                color="primary"
                :loading="importing"
                :disabled="!preview.resolutionResults?.length"
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
    const file = ref<File[]>([]);
    const csvText = ref('');
    const columnMappings = ref<{ header: string; mapping: string }[]>([]);
    const preview = ref<any>({});
    const resolving = ref(false);
    const importing = ref(false);

    const mappingOptions = [
        { label: 'Company Name', value: 'name' },
        { label: 'CIK', value: 'cik' },
        { label: 'Ticker / Symbol', value: 'ticker' },
        { label: 'CUSIP', value: 'cusip' },
        { label: 'FIGI', value: 'figi' },
        { label: 'ISIN', value: 'isin' },
        { label: 'LEI', value: 'lei' },
        { label: 'EIN', value: 'ein' },
        { label: '(Ignore)', value: 'ignore' },
    ];

    const resolutionHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'Matched', key: 'matched', align: 'center' as const },
        { title: 'Method', key: 'matchMethod' },
        { title: 'Confidence', key: 'confidence', align: 'center' as const },
        { title: 'IDs', key: 'resolutionStrength', align: 'center' as const },
    ];

    async function handleFileUpload() {
        if (!file.value?.length) return;
        const f = file.value[0];
        csvText.value = await f.text();
    }

    async function parseAndPreview() {
        if (!csvText.value.trim()) return;
        try {
            preview.value = await $fetch(`/api/v2/projects/${props.projectId}/csv-preview`, {
                method: 'POST',
                body: { csvText: csvText.value },
            });
            columnMappings.value = preview.value.mappings || [];
            step.value = 2;
        } catch (e: any) {
            preview.value = { error: e.data?.statusMessage || 'Parse failed' };
        }
    }

    async function resolvePreview() {
        resolving.value = true;
        step.value = 3;
        try {
            preview.value = await $fetch(`/api/v2/projects/${props.projectId}/csv-preview`, {
                method: 'POST',
                body: {
                    csvText: csvText.value,
                    columnMappings: columnMappings.value,
                    resolve: true,
                },
            });
        } catch (e: any) {
            preview.value = { error: e.data?.statusMessage || 'Resolution failed' };
        }
        resolving.value = false;
    }

    async function importEntities() {
        importing.value = true;
        try {
            const batch = (preview.value.resolutionResults || [])
                .filter((r: any) => r.matched)
                .map((r: any) => ({
                    name: r.name,
                    ticker: r.identifiers?.ticker,
                    cik: r.identifiers?.cik,
                }));
            await $fetch(`/api/v2/projects/${props.projectId}/entities`, {
                method: 'POST',
                body: { batch, sourceType: 'csv' },
            });
            emit('imported', batch.length);
        } catch {
            // handled by parent
        }
        importing.value = false;
    }
</script>
