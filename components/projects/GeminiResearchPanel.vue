<template>
    <v-card>
        <v-card-title class="d-flex align-center">
            <v-icon class="mr-2" color="primary">mdi-creation</v-icon>
            Gemini Research Planner
        </v-card-title>

        <v-card-text>
            <!-- Query Input -->
            <div v-if="!plan">
                <v-text-field
                    v-model="topic"
                    label="Research topic"
                    placeholder="e.g. Regional banks in the Southeast with rising leverage"
                    variant="outlined"
                    density="comfortable"
                    class="mb-3"
                />

                <v-row dense class="mb-3">
                    <v-col cols="12" sm="4">
                        <v-text-field
                            v-model="context"
                            label="Context (optional)"
                            placeholder="Focus on..."
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                    <v-col cols="12" sm="4">
                        <v-text-field
                            v-model="geography"
                            label="Geography (optional)"
                            placeholder="e.g. Southeast US"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                    <v-col cols="12" sm="4">
                        <v-text-field
                            v-model="timeHorizon"
                            label="Time horizon (optional)"
                            placeholder="e.g. 2024-2026"
                            variant="outlined"
                            density="compact"
                            hide-details
                        />
                    </v-col>
                </v-row>

                <div class="mb-4">
                    <div class="text-caption text-grey mb-2">Templates</div>
                    <div class="d-flex flex-wrap ga-2">
                        <v-chip
                            v-for="t in templates"
                            :key="t.id"
                            :variant="selectedTemplate === t.id ? 'flat' : 'outlined'"
                            :color="selectedTemplate === t.id ? 'primary' : undefined"
                            size="small"
                            class="cursor-pointer"
                            @click="selectTemplate(t)"
                        >
                            {{ t.name }}
                        </v-chip>
                    </div>
                </div>

                <v-alert v-if="error" type="error" variant="tonal" class="mb-4" closable>
                    {{ error }}
                </v-alert>
            </div>

            <!-- Research Plan Results -->
            <div v-else>
                <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                    <div class="font-weight-medium">{{ plan.topicSummary }}</div>
                    <div v-if="plan.coverageNotes" class="text-caption mt-1">
                        {{ plan.coverageNotes }}
                    </div>
                </v-alert>

                <!-- Collapsible Plan Details -->
                <v-expansion-panels variant="accordion" class="mb-4">
                    <v-expansion-panel>
                        <v-expansion-panel-title class="text-body-2">
                            Research Plan Details
                            <template #actions="{ expanded }">
                                <v-chip size="x-small" variant="tonal" class="mr-2">
                                    {{ plan.subthemes.length }} subthemes
                                </v-chip>
                                <v-chip size="x-small" variant="tonal" class="mr-2">
                                    {{ plan.searchQueries.length }} queries
                                </v-chip>
                                <v-icon>{{
                                    expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'
                                }}</v-icon>
                            </template>
                        </v-expansion-panel-title>
                        <v-expansion-panel-text>
                            <div v-if="plan.subthemes.length" class="mb-3">
                                <div class="text-caption text-grey mb-1">Subthemes</div>
                                <v-chip
                                    v-for="s in plan.subthemes"
                                    :key="s"
                                    size="x-small"
                                    variant="tonal"
                                    class="mr-1 mb-1"
                                >
                                    {{ s }}
                                </v-chip>
                            </div>
                            <div v-if="plan.signalHypotheses.length" class="mb-3">
                                <div class="text-caption text-grey mb-1">Signal Hypotheses</div>
                                <ul class="text-body-2 pl-4">
                                    <li v-for="h in plan.signalHypotheses" :key="h">{{ h }}</li>
                                </ul>
                            </div>
                            <div v-if="plan.keywords.length" class="mb-3">
                                <div class="text-caption text-grey mb-1">Keywords</div>
                                <v-chip
                                    v-for="k in plan.keywords"
                                    :key="k"
                                    size="x-small"
                                    variant="outlined"
                                    class="mr-1 mb-1"
                                >
                                    {{ k }}
                                </v-chip>
                            </div>
                        </v-expansion-panel-text>
                    </v-expansion-panel>
                </v-expansion-panels>

                <!-- Target Entities -->
                <div class="d-flex align-center mb-2">
                    <div class="text-subtitle-2">Target Entities</div>
                    <v-spacer />
                    <v-btn size="x-small" variant="text" @click="selectAll(true)">Select All</v-btn>
                    <v-btn size="x-small" variant="text" @click="selectAll(false)"
                        >Deselect All</v-btn
                    >
                </div>

                <v-list density="compact" class="mb-4">
                    <v-list-item
                        v-for="(entity, i) in plan.targetEntities"
                        :key="i"
                        @click="entity.selected = !entity.selected"
                    >
                        <template #prepend>
                            <v-checkbox-btn
                                :model-value="entity.selected"
                                density="compact"
                                @update:model-value="entity.selected = $event"
                            />
                        </template>
                        <v-list-item-title>
                            {{ entity.name }}
                            <v-chip
                                v-if="entity.ticker"
                                size="x-small"
                                variant="tonal"
                                class="ml-1"
                            >
                                {{ entity.ticker }}
                            </v-chip>
                        </v-list-item-title>
                        <v-list-item-subtitle>{{ entity.rationale }}</v-list-item-subtitle>
                    </v-list-item>
                </v-list>
            </div>
        </v-card-text>

        <v-card-actions>
            <v-btn v-if="plan" variant="text" @click="plan = null">New Research</v-btn>
            <v-spacer />
            <v-btn variant="text" @click="$emit('cancel')">Cancel</v-btn>
            <v-btn
                v-if="!plan"
                color="primary"
                :disabled="!topic.trim()"
                :loading="loading"
                @click="runResearch"
            >
                Run Research
            </v-btn>
            <div v-if="adding" class="d-flex align-center mr-4">
                <v-progress-circular
                    size="16"
                    width="2"
                    indeterminate
                    color="primary"
                    class="mr-2"
                />
                <span class="text-caption text-grey">Resolving entities against Elemental...</span>
            </div>
            <v-btn
                v-else
                color="primary"
                :disabled="selectedCount === 0"
                :loading="adding"
                @click="addSelectedEntities"
            >
                Add {{ selectedCount }} Entities &amp; Resolve
            </v-btn>
        </v-card-actions>
    </v-card>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string }>();
    const emit = defineEmits<{ cancel: []; imported: [count: number] }>();

    const topic = ref('');
    const context = ref('');
    const geography = ref('');
    const timeHorizon = ref('');
    const selectedTemplate = ref('');
    const loading = ref(false);
    const adding = ref(false);
    const error = ref('');
    const plan = ref<any>(null);

    const templates = [
        { id: 'sector_scan', name: 'Sector Scan', prompt: 'Top companies in [sector] by [metric]' },
        { id: 'risk_screen', name: 'Risk Screen', prompt: 'Companies with [risk indicator]' },
        { id: 'peer_group', name: 'Peer Group', prompt: 'Direct competitors of [company]' },
        {
            id: 'index_constituents',
            name: 'Index Constituents',
            prompt: '[Index name] constituents',
        },
        {
            id: 'event_driven',
            name: 'Event-Driven',
            prompt: 'Companies affected by [event/regulation]',
        },
    ];

    const selectedCount = computed(
        () => plan.value?.targetEntities?.filter((e: any) => e.selected).length ?? 0
    );

    function selectTemplate(t: any) {
        selectedTemplate.value = selectedTemplate.value === t.id ? '' : t.id;
        if (selectedTemplate.value && !topic.value) {
            topic.value = t.prompt;
        }
    }

    function selectAll(selected: boolean) {
        if (!plan.value?.targetEntities) return;
        for (const e of plan.value.targetEntities) {
            e.selected = selected;
        }
    }

    async function runResearch() {
        if (!topic.value.trim()) return;
        loading.value = true;
        error.value = '';
        try {
            plan.value = await $fetch(`/api/v2/projects/${props.projectId}/research`, {
                method: 'POST',
                body: {
                    topic: topic.value.trim(),
                    context: context.value || undefined,
                    geography: geography.value || undefined,
                    timeHorizon: timeHorizon.value || undefined,
                    template: selectedTemplate.value || undefined,
                },
            });
        } catch (e: any) {
            error.value = e.data?.statusMessage || e.message || 'Research query failed';
        }
        loading.value = false;
    }

    async function addSelectedEntities() {
        if (!plan.value?.targetEntities) return;
        adding.value = true;
        error.value = '';
        try {
            const selected = plan.value.targetEntities.filter((e: any) => e.selected);
            const batch = selected.map((e: any) => ({
                name: e.name,
                ticker: e.ticker,
                rationale: e.rationale,
            }));
            const res = await $fetch<any>(`/api/v2/projects/${props.projectId}/entities`, {
                method: 'POST',
                body: { batch, sourceType: 'gemini_research' },
                timeout: 120000,
            });
            emit('imported', res?.added || batch.length);
        } catch (e: any) {
            error.value = e.data?.statusMessage || e.message || 'Failed to add entities';
        }
        adding.value = false;
    }
</script>

<style scoped>
    .cursor-pointer {
        cursor: pointer;
    }
</style>
