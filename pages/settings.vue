<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-2">
            <PageHeader
                title="Settings"
                subtitle="Configure the credit monitor and agent pipeline"
            />
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-6 pt-2">
            <v-row>
                <v-col cols="12" md="6">
                    <v-card class="mb-4">
                        <v-card-title class="text-subtitle-1">
                            <v-icon size="18" class="mr-1">mdi-connection</v-icon>
                            Elemental API
                        </v-card-title>
                        <v-card-text>
                            <div class="d-flex align-center mb-2">
                                <span class="text-body-2 text-grey mr-2">Gateway:</span>
                                <code class="text-body-2">{{
                                    gatewayUrl || 'Not configured'
                                }}</code>
                            </div>
                            <div class="d-flex align-center mb-2">
                                <span class="text-body-2 text-grey mr-2">Org ID:</span>
                                <code class="text-body-2">{{ orgId || 'Not configured' }}</code>
                            </div>
                            <div class="d-flex align-center">
                                <span class="text-body-2 text-grey mr-2">API Key:</span>
                                <code class="text-body-2">{{
                                    apiKey ? '••••' + apiKey.slice(-6) : 'Not configured'
                                }}</code>
                            </div>
                        </v-card-text>
                    </v-card>

                    <v-card class="mb-4">
                        <v-card-title class="text-subtitle-1">
                            <v-icon size="18" class="mr-1">mdi-robot-outline</v-icon>
                            Gemini AI
                        </v-card-title>
                        <v-card-text>
                            <div class="d-flex align-center mb-2">
                                <span class="text-body-2 text-grey mr-2">Status:</span>
                                <v-chip
                                    :color="geminiConfigured ? 'success' : 'warning'"
                                    size="x-small"
                                    variant="tonal"
                                >
                                    {{ geminiConfigured ? 'Configured' : 'Not configured' }}
                                </v-chip>
                            </div>
                            <div class="text-caption text-grey">
                                Set GEMINI_API_KEY in .env to enable agent reasoning.
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>

                <v-col cols="12" md="6">
                    <v-card class="mb-4">
                        <v-card-title class="text-subtitle-1">
                            <v-icon size="18" class="mr-1">mdi-tune</v-icon>
                            Scoring Weights
                        </v-card-title>
                        <v-card-text>
                            <div class="mb-4">
                                <div class="d-flex justify-space-between text-body-2 mb-1">
                                    <span>Financial Health (FHS)</span>
                                    <span>{{ fhsWeight }}%</span>
                                </div>
                                <v-slider
                                    v-model="fhsWeight"
                                    :min="0"
                                    :max="100"
                                    :step="5"
                                    color="primary"
                                    track-color="grey-darken-3"
                                    hide-details
                                    @update:model-value="ersWeight = 100 - fhsWeight"
                                />
                            </div>
                            <div>
                                <div class="d-flex justify-space-between text-body-2 mb-1">
                                    <span>Executive Risk (ERS)</span>
                                    <span>{{ ersWeight }}%</span>
                                </div>
                                <v-slider
                                    v-model="ersWeight"
                                    :min="0"
                                    :max="100"
                                    :step="5"
                                    color="warning"
                                    track-color="grey-darken-3"
                                    hide-details
                                    @update:model-value="fhsWeight = 100 - ersWeight"
                                />
                            </div>
                        </v-card-text>
                    </v-card>

                    <v-card>
                        <v-card-title class="text-subtitle-1">
                            <v-icon size="18" class="mr-1">mdi-information-outline</v-icon>
                            About
                        </v-card-title>
                        <v-card-text>
                            <div class="text-body-2 mb-2">Agent-First FSI Credit Monitor</div>
                            <div class="text-caption text-grey">
                                Built on the Lovelace platform with Elemental Knowledge Graph,
                                Gemini AI, and the 4-agent pipeline architecture.
                            </div>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>
        </div>
    </div>
</template>

<script setup lang="ts">
    const config = useRuntimeConfig();
    const gatewayUrl = (config.public as any).gatewayUrl || '';
    const orgId = (config.public as any).tenantOrgId || '';
    const apiKey = (config.public as any).qsApiKey || '';
    const geminiConfigured = ref(false);

    const fhsWeight = ref(60);
    const ersWeight = ref(40);

    onMounted(async () => {
        try {
            const status = await $fetch<{ configured: boolean }>('/api/v2/agents/gemini-status');
            geminiConfigured.value = status.configured;
        } catch {
            geminiConfigured.value = false;
        }
    });
</script>
