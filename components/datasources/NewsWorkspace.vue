<template>
    <div class="pa-4">
        <v-tabs v-model="subTab" density="compact" class="mb-4">
            <v-tab value="entities">Entities</v-tab>
            <v-tab value="articles">Recent Articles</v-tab>
            <v-tab value="events">News Events</v-tab>
            <v-tab value="sentiment">Sentiment</v-tab>
            <v-tab value="summary">Portfolio Update</v-tab>
        </v-tabs>

        <v-window v-model="subTab">
            <v-window-item value="entities">
                <v-data-table
                    :headers="entityHeaders"
                    :items="newsEntities"
                    density="comfortable"
                    hover
                    :loading="loading"
                >
                    <template #item.neidStatus="{ value }">
                        <v-icon :color="value ? 'success' : 'error'" size="16">
                            {{ value ? 'mdi-check-circle' : 'mdi-close-circle' }}
                        </v-icon>
                    </template>
                    <template #no-data>
                        <v-empty-state
                            icon="mdi-newspaper"
                            title="No entities"
                            text="Add entities with NEIDs to access news data."
                        />
                    </template>
                </v-data-table>
            </v-window-item>

            <v-window-item value="articles">
                <div v-if="articles.length === 0" class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-newspaper-variant-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2 mb-4">
                        News articles are discovered by the History Agent through Elemental's
                        article and news properties.
                    </div>
                    <v-btn
                        color="primary"
                        prepend-icon="mdi-sync"
                        size="small"
                        :loading="syncingNews"
                        @click="syncNews"
                    >
                        Fetch News Data
                    </v-btn>
                </div>
                <v-list v-else lines="three">
                    <v-list-item v-for="article in articles" :key="article.id">
                        <v-list-item-title class="font-weight-medium">{{
                            article.title
                        }}</v-list-item-title>
                        <v-list-item-subtitle
                            >{{ article.source }} · {{ article.date }}</v-list-item-subtitle
                        >
                        <template #append>
                            <v-chip
                                v-if="article.sentiment"
                                :color="
                                    article.sentiment > 0
                                        ? 'success'
                                        : article.sentiment < 0
                                          ? 'error'
                                          : 'grey'
                                "
                                size="x-small"
                                variant="tonal"
                            >
                                {{ article.sentiment > 0 ? '+' : ''
                                }}{{ article.sentiment.toFixed(2) }}
                            </v-chip>
                        </template>
                    </v-list-item>
                </v-list>
            </v-window-item>

            <v-window-item value="events">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-calendar-text</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        News events (earnings, M&A, regulatory) are extracted from articles by the
                        Query Agent during analysis.
                    </div>
                </div>
            </v-window-item>

            <v-window-item value="sentiment">
                <div v-if="newsEntities.length === 0" class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-emoticon-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2">
                        Sentiment data requires entities with NEIDs. Resolve entities first.
                    </div>
                </div>
                <v-row v-else>
                    <v-col
                        v-for="entity in newsEntities"
                        :key="entity.neid"
                        cols="12"
                        sm="6"
                        md="4"
                    >
                        <v-card>
                            <v-card-title class="text-subtitle-2">{{ entity.name }}</v-card-title>
                            <v-card-text>
                                <div class="d-flex align-center">
                                    <span class="text-caption text-grey mr-2">NEID:</span>
                                    <span class="text-caption">{{ entity.neid }}</span>
                                </div>
                                <div class="text-caption text-grey mt-1">
                                    Sentiment data available through Elemental graph_sentiment
                                </div>
                            </v-card-text>
                        </v-card>
                    </v-col>
                </v-row>
            </v-window-item>

            <v-window-item value="summary">
                <div class="text-center pa-8">
                    <v-icon size="48" color="grey-darken-1">mdi-text-box-outline</v-icon>
                    <div class="text-body-1 text-grey mt-2 mb-4">
                        AI-generated portfolio news summary. Synthesizes coverage across all project
                        entities.
                    </div>
                    <v-btn color="primary" prepend-icon="mdi-creation" size="small" disabled>
                        Generate Portfolio Update
                    </v-btn>
                    <div class="text-caption text-grey mt-2">
                        Requires Gemini + news data from agent scan
                    </div>
                </div>
            </v-window-item>
        </v-window>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ projectId: string; entities: any[] }>();

    const subTab = ref('entities');
    const loading = ref(false);
    const syncingNews = ref(false);
    const articles = ref<any[]>([]);

    const entityHeaders = [
        { title: 'Name', key: 'name' },
        { title: 'NEID', key: 'neidStatus', align: 'center' as const },
        { title: 'Entity ID', key: 'neid' },
        { title: 'Type', key: 'entityType' },
    ];

    const newsEntities = computed(() =>
        props.entities
            .filter((e: any) => e.neid && !e.neid.startsWith('unresolved'))
            .map((e: any) => ({
                ...e,
                neidStatus: true,
            }))
    );

    async function syncNews() {
        syncingNews.value = true;
        // News sync would call the History Agent for news-specific data
        await new Promise((r) => setTimeout(r, 1000));
        syncingNews.value = false;
    }
</script>
