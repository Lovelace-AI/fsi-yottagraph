<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-0">
            <div class="d-flex align-center mb-4">
                <PageHeader
                    :title="activeProject ? activeProject.name : 'Agent Pipeline'"
                    subtitle="Monitor and interact with the 4-agent credit risk pipeline"
                />
                <v-spacer />
                <v-btn
                    v-if="activeProject"
                    size="small"
                    variant="outlined"
                    prepend-icon="mdi-plus"
                    class="mr-2"
                    @click="showAddEntity = true"
                >
                    Add Entity
                </v-btn>
                <v-btn
                    v-if="activeProject && entities.length > 0"
                    size="small"
                    color="primary"
                    prepend-icon="mdi-radar"
                    :loading="scanning"
                    @click="handleScan"
                >
                    Scan All
                </v-btn>
            </div>

            <v-tabs v-model="tab" color="primary" density="compact">
                <v-tab value="activity">
                    <v-icon size="16" class="mr-1">mdi-pulse</v-icon>
                    Activity Feed
                    <v-badge
                        v-if="events.length > 0"
                        :content="events.length"
                        color="primary"
                        inline
                        class="ml-1"
                    />
                </v-tab>
                <v-tab value="dialogue">
                    <v-icon size="16" class="mr-1">mdi-chat-outline</v-icon>
                    Dialogue
                </v-tab>
                <v-tab value="compare">
                    <v-icon size="16" class="mr-1">mdi-compare</v-icon>
                    Compare
                </v-tab>
                <v-tab value="sessions">
                    <v-icon size="16" class="mr-1">mdi-history</v-icon>
                    Sessions
                </v-tab>
                <v-tab value="entities">
                    <v-icon size="16" class="mr-1">mdi-domain</v-icon>
                    Entities
                    <v-badge
                        v-if="entities.length > 0"
                        :content="entities.length"
                        color="grey"
                        inline
                        class="ml-1"
                    />
                </v-tab>
            </v-tabs>
        </div>

        <v-divider />

        <div class="flex-grow-1 overflow-y-auto">
            <v-window v-model="tab">
                <v-window-item value="activity">
                    <div class="pa-4">
                        <div v-if="!activeProject" class="text-center pa-12">
                            <v-icon size="48" color="grey-darken-1"
                                >mdi-folder-alert-outline</v-icon
                            >
                            <div class="text-body-1 text-grey mt-2">
                                Select a project from the
                                <router-link to="/" class="text-primary">Projects</router-link>
                                page to see agent activity.
                            </div>
                        </div>
                        <div v-else-if="events.length === 0" class="text-center pa-12">
                            <v-icon size="48" color="grey-darken-1">mdi-robot-off-outline</v-icon>
                            <div class="text-body-1 text-grey mt-2">
                                No agent activity yet. Add entities and click
                                <strong>Scan All</strong> to start the pipeline.
                            </div>
                        </div>
                        <div v-else class="activity-feed">
                            <div
                                v-for="evt in reversedEvents"
                                :key="evt.id"
                                class="d-flex align-start mb-3"
                            >
                                <v-avatar
                                    :color="agentColor(evt.agentType)"
                                    size="32"
                                    class="mr-3 mt-1 flex-shrink-0"
                                >
                                    <v-icon size="16" color="white">{{
                                        agentIcon(evt.agentType)
                                    }}</v-icon>
                                </v-avatar>
                                <div class="flex-grow-1">
                                    <div class="d-flex align-center">
                                        <v-chip
                                            :color="agentColor(evt.agentType)"
                                            size="x-small"
                                            variant="tonal"
                                            class="mr-2 text-uppercase"
                                        >
                                            {{ evt.agentType }}
                                        </v-chip>
                                        <span class="text-body-2 font-weight-medium">{{
                                            evt.action
                                        }}</span>
                                        <v-spacer />
                                        <span class="text-caption text-grey">{{
                                            formatTime(evt.timestamp)
                                        }}</span>
                                    </div>
                                    <div v-if="evt.detail" class="text-body-2 text-grey mt-1">
                                        {{ evt.detail }}
                                    </div>
                                    <div
                                        v-if="evt.durationMs"
                                        class="text-caption text-grey-darken-1 mt-1"
                                    >
                                        {{ evt.durationMs }}ms
                                        <span v-if="evt.entityName"> · {{ evt.entityName }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </v-window-item>

                <v-window-item value="dialogue">
                    <div class="d-flex flex-column" style="height: calc(100vh - 200px)">
                        <div class="flex-grow-1 overflow-y-auto pa-4">
                            <div v-if="chatMessages.length === 0" class="text-center pa-12">
                                <v-icon size="48" color="grey-darken-1">mdi-chat-outline</v-icon>
                                <div class="text-body-1 text-grey mt-2 mb-4">
                                    Ask a question about your monitored entities.
                                </div>
                                <div class="d-flex flex-wrap justify-center ga-2">
                                    <v-chip
                                        v-for="suggestion in suggestions"
                                        :key="suggestion"
                                        variant="outlined"
                                        size="small"
                                        class="cursor-pointer"
                                        @click="chatInput = suggestion"
                                    >
                                        {{ suggestion }}
                                    </v-chip>
                                </div>
                            </div>
                            <div v-else>
                                <div v-for="msg in chatMessages" :key="msg.id" class="mb-4">
                                    <div
                                        :class="[
                                            'd-flex',
                                            msg.role === 'user' ? 'justify-end' : 'justify-start',
                                        ]"
                                    >
                                        <v-card
                                            :color="
                                                msg.role === 'user' ? 'primary' : 'surface-variant'
                                            "
                                            :class="[
                                                'pa-3',
                                                msg.role === 'user' ? 'text-black' : '',
                                            ]"
                                            max-width="80%"
                                            flat
                                        >
                                            <div class="text-body-2" style="white-space: pre-wrap">
                                                {{ msg.text || '...' }}
                                            </div>
                                        </v-card>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <v-divider />
                        <div class="pa-4 flex-shrink-0">
                            <v-text-field
                                v-model="chatInput"
                                placeholder="Ask about your entities..."
                                variant="outlined"
                                density="comfortable"
                                hide-details
                                append-inner-icon="mdi-send"
                                :loading="chatLoading"
                                @keyup.enter="sendChat"
                                @click:append-inner="sendChat"
                            />
                        </div>
                    </div>
                </v-window-item>

                <v-window-item value="compare">
                    <div class="pa-4">
                        <div class="mb-4">
                            <div class="text-body-2 text-grey mb-2">
                                Compare raw Gemini (no knowledge graph context) vs Gemini with
                                Elemental data. See how grounding in real data changes the answer.
                            </div>
                            <v-text-field
                                v-model="compareQuestion"
                                placeholder="e.g. What is the credit risk profile for Delta Air Lines?"
                                variant="outlined"
                                density="comfortable"
                                hide-details
                                append-inner-icon="mdi-compare"
                                :loading="comparing"
                                @keyup.enter="runComparison"
                                @click:append-inner="runComparison"
                            />
                        </div>

                        <v-row v-if="comparisonResult">
                            <v-col cols="12" md="6">
                                <v-card color="surface-variant">
                                    <v-card-title class="text-subtitle-2 d-flex align-center">
                                        <v-icon size="16" class="mr-1" color="grey"
                                            >mdi-robot-off-outline</v-icon
                                        >
                                        Raw Gemini (no context)
                                        <v-spacer />
                                        <v-chip size="x-small" variant="tonal">
                                            {{ comparisonResult.raw.durationMs }}ms
                                        </v-chip>
                                    </v-card-title>
                                    <v-card-text>
                                        <div
                                            class="text-body-2"
                                            style="
                                                white-space: pre-wrap;
                                                max-height: 500px;
                                                overflow-y: auto;
                                            "
                                        >
                                            {{ comparisonResult.raw.response }}
                                        </div>
                                    </v-card-text>
                                </v-card>
                            </v-col>
                            <v-col cols="12" md="6">
                                <v-card>
                                    <v-card-title class="text-subtitle-2 d-flex align-center">
                                        <v-icon size="16" class="mr-1" color="primary"
                                            >mdi-database-check</v-icon
                                        >
                                        With Elemental Context
                                        <v-spacer />
                                        <v-chip size="x-small" variant="tonal" color="primary">
                                            {{ comparisonResult.contextual.durationMs }}ms
                                        </v-chip>
                                    </v-card-title>
                                    <v-card-text>
                                        <div
                                            class="text-body-2"
                                            style="
                                                white-space: pre-wrap;
                                                max-height: 500px;
                                                overflow-y: auto;
                                            "
                                        >
                                            {{ comparisonResult.contextual.response }}
                                        </div>
                                    </v-card-text>
                                </v-card>
                            </v-col>
                        </v-row>
                    </div>
                </v-window-item>

                <v-window-item value="sessions">
                    <div class="pa-4">
                        <v-progress-circular v-if="sessionsLoading" indeterminate color="primary" />
                        <div v-else-if="sessions.length === 0" class="text-center pa-12">
                            <v-icon size="48" color="grey-darken-1">mdi-history</v-icon>
                            <div class="text-body-1 text-grey mt-2">No pipeline sessions yet.</div>
                        </div>
                        <v-card v-else variant="flat" color="transparent">
                            <v-data-table
                                :headers="sessionHeaders"
                                :items="sessions"
                                density="comfortable"
                                hover
                            >
                                <template #item.status="{ value }">
                                    <v-chip
                                        :color="
                                            value === 'complete'
                                                ? 'success'
                                                : value === 'error'
                                                  ? 'error'
                                                  : 'warning'
                                        "
                                        size="x-small"
                                        variant="tonal"
                                    >
                                        {{ value }}
                                    </v-chip>
                                </template>
                                <template #item.startedAt="{ value }">
                                    {{ formatTime(new Date(value).getTime()) }}
                                </template>
                            </v-data-table>
                        </v-card>
                    </div>
                </v-window-item>

                <v-window-item value="entities">
                    <div class="pa-4">
                        <div v-if="entities.length === 0" class="text-center pa-12">
                            <v-icon size="48" color="grey-darken-1">mdi-domain</v-icon>
                            <div class="text-body-1 text-grey mt-2 mb-4">
                                No entities in this project yet.
                            </div>
                            <v-btn
                                color="primary"
                                prepend-icon="mdi-plus"
                                @click="showAddEntity = true"
                            >
                                Add Entity
                            </v-btn>
                        </div>
                        <v-list v-else lines="two">
                            <v-list-item v-for="entity in entities" :key="entity.neid">
                                <template #prepend>
                                    <v-avatar color="surface-variant" size="40">
                                        <v-icon size="20">mdi-domain</v-icon>
                                    </v-avatar>
                                </template>
                                <v-list-item-title>{{ entity.name }}</v-list-item-title>
                                <v-list-item-subtitle>
                                    {{ entity.entityType }} · {{ entity.neid }}
                                </v-list-item-subtitle>
                                <template #append>
                                    <v-chip
                                        v-if="entity.score"
                                        :color="severityColor(entity.score.severity)"
                                        size="x-small"
                                        variant="tonal"
                                        class="mr-2"
                                    >
                                        {{ entity.score.severity }}
                                    </v-chip>
                                    <v-btn
                                        icon="mdi-close"
                                        size="x-small"
                                        variant="text"
                                        @click="removeEntity(entity.neid)"
                                    />
                                </template>
                            </v-list-item>
                        </v-list>
                    </div>
                </v-window-item>
            </v-window>
        </div>

        <v-dialog v-model="showAddEntity" max-width="500">
            <v-card>
                <v-card-title>Add Entity</v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="entityName"
                        label="Entity name"
                        placeholder="e.g. Microsoft, JPMorgan Chase, Delta Air Lines"
                        autofocus
                        :error-messages="addError"
                        @keyup.enter="handleAddEntity"
                    />
                    <div class="text-caption text-grey">
                        The Dialogue Agent will resolve this name to an entity in the knowledge
                        graph.
                    </div>
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="showAddEntity = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!entityName.trim()"
                        :loading="addingEntity"
                        @click="handleAddEntity"
                    >
                        Add
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
    const { activeProject, entities, addEntity, removeEntity, triggerScan } = useProject();
    const { events } = useActivityStream();
    const {
        messages: chatMessages,
        loading: chatLoading,
        sendMessage,
        selectAgent,
    } = useAgentChat();

    const tab = ref('activity');
    const showAddEntity = ref(false);
    const entityName = ref('');
    const addingEntity = ref(false);
    const addError = ref('');
    const scanning = ref(false);
    const chatInput = ref('');
    const sessions = ref<any[]>([]);
    const sessionsLoading = ref(false);
    const compareQuestion = ref('');
    const comparing = ref(false);
    const comparisonResult = ref<any>(null);

    const suggestions = [
        'What is the risk profile for Microsoft?',
        'Show me the highest risk entities',
        'Generate a brief on the top deteriorating names',
        'What changed at JPMorgan last quarter?',
    ];

    const sessionHeaders = [
        { title: 'Session', key: 'id' },
        { title: 'Status', key: 'status' },
        { title: 'Entities', key: 'entityCount' },
        { title: 'Started', key: 'startedAt' },
    ];

    const reversedEvents = computed(() => [...events.value].reverse());

    onMounted(async () => {
        if (activeProject.value) {
            await loadSessions();
        }
    });

    async function handleAddEntity() {
        if (!entityName.value.trim()) return;
        addingEntity.value = true;
        addError.value = '';
        const result = await addEntity(entityName.value.trim());
        addingEntity.value = false;
        if (result) {
            entityName.value = '';
            showAddEntity.value = false;
        } else {
            addError.value = `Could not resolve "${entityName.value}" in the knowledge graph`;
        }
    }

    async function handleScan() {
        scanning.value = true;
        tab.value = 'activity';
        await triggerScan();
        scanning.value = false;
        await loadSessions();
    }

    async function loadSessions() {
        if (!activeProject.value) return;
        sessionsLoading.value = true;
        try {
            sessions.value = await $fetch('/api/v2/agents/sessions', {
                params: { projectId: activeProject.value.id },
            });
        } catch {
            sessions.value = [];
        }
        sessionsLoading.value = false;
    }

    async function runComparison() {
        if (!compareQuestion.value.trim()) return;
        comparing.value = true;
        comparisonResult.value = null;
        try {
            comparisonResult.value = await $fetch('/api/v2/agents/compare', {
                method: 'POST',
                body: { question: compareQuestion.value.trim() },
            });
        } catch (e: any) {
            comparisonResult.value = {
                question: compareQuestion.value,
                raw: { response: 'Error: ' + (e.message || 'Request failed'), durationMs: 0 },
                contextual: {
                    response: 'Error: ' + (e.message || 'Request failed'),
                    durationMs: 0,
                },
            };
        }
        comparing.value = false;
    }

    async function sendChat() {
        if (!chatInput.value.trim()) return;
        const text = chatInput.value.trim();
        chatInput.value = '';
        await sendMessage(text);
    }

    function agentColor(type: string): string {
        const colors: Record<string, string> = {
            dialogue: '#9C27B0',
            history: '#2196F3',
            query: '#4CAF50',
            composition: '#FF9800',
            pipeline: '#3fea00',
        };
        return colors[type] || '#757575';
    }

    function agentIcon(type: string): string {
        const icons: Record<string, string> = {
            dialogue: 'mdi-chat-processing',
            history: 'mdi-database-search',
            query: 'mdi-chart-line',
            composition: 'mdi-file-document-edit',
            pipeline: 'mdi-pipe',
        };
        return icons[type] || 'mdi-robot';
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

    function formatTime(ts: number): string {
        return new Date(ts).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }
</script>

<style scoped>
    .activity-feed {
        max-height: calc(100vh - 280px);
        overflow-y: auto;
    }
    .cursor-pointer {
        cursor: pointer;
    }
</style>
