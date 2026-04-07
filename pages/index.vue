<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-2">
            <PageHeader title="Projects" subtitle="Create and manage entity monitoring lists" />
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-6 pt-2">
            <div class="d-flex align-center mb-4">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreate = true">
                    New Project
                </v-btn>
                <v-spacer />
                <v-chip v-if="projects.length" variant="tonal" size="small">
                    {{ projects.length }} project{{ projects.length === 1 ? '' : 's' }}
                </v-chip>
            </div>

            <v-progress-circular v-if="loading" indeterminate color="primary" class="ma-8" />

            <v-alert v-else-if="error" type="error" variant="tonal" class="mb-4">
                {{ error }}
            </v-alert>

            <div v-else-if="projects.length === 0" class="text-center pa-12">
                <v-icon size="64" color="grey-darken-1" class="mb-4"
                    >mdi-folder-plus-outline</v-icon
                >
                <div class="text-h6 text-grey mb-2">No projects yet</div>
                <div class="text-body-2 text-grey-darken-1 mb-4">
                    Create a project to start monitoring entities for credit risk.
                </div>
                <v-btn color="primary" prepend-icon="mdi-plus" @click="showCreate = true">
                    Create Your First Project
                </v-btn>
            </div>

            <v-row v-else>
                <v-col v-for="project in projects" :key="project.id" cols="12" sm="6" md="4">
                    <v-card class="cursor-pointer" hover @click="handleSelect(project)">
                        <v-card-title class="d-flex align-center">
                            <v-icon color="primary" size="20" class="mr-2"
                                >mdi-folder-outline</v-icon
                            >
                            {{ project.name }}
                        </v-card-title>
                        <v-card-subtitle v-if="project.description">
                            {{ project.description }}
                        </v-card-subtitle>
                        <v-card-text>
                            <v-chip size="x-small" variant="tonal" class="mr-1">
                                Created {{ formatDate(project.createdAt) }}
                            </v-chip>
                        </v-card-text>
                        <v-card-actions>
                            <v-btn
                                size="small"
                                color="primary"
                                variant="text"
                                @click.stop="handleSelect(project)"
                            >
                                Open
                            </v-btn>
                            <v-spacer />
                            <v-btn
                                size="small"
                                color="error"
                                variant="text"
                                icon="mdi-delete-outline"
                                @click.stop="handleDelete(project.id)"
                            />
                        </v-card-actions>
                    </v-card>
                </v-col>
            </v-row>
        </div>

        <v-dialog v-model="showCreate" max-width="500">
            <v-card>
                <v-card-title>New Project</v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="newName"
                        label="Project name"
                        placeholder="e.g. Q2 Credit Review"
                        autofocus
                        @keyup.enter="handleCreate"
                    />
                    <v-textarea
                        v-model="newDescription"
                        label="Description (optional)"
                        rows="2"
                        placeholder="Brief description of this monitoring project"
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="showCreate = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!newName.trim()"
                        :loading="creating"
                        @click="handleCreate"
                    >
                        Create
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
    const { projects, loading, error, fetchProjects, createProject, selectProject, deleteProject } =
        useProject();
    const router = useRouter();

    const showCreate = ref(false);
    const newName = ref('');
    const newDescription = ref('');
    const creating = ref(false);

    onMounted(() => {
        fetchProjects();
    });

    async function handleCreate() {
        if (!newName.value.trim()) return;
        creating.value = true;
        const project = await createProject(newName.value.trim(), newDescription.value.trim());
        creating.value = false;
        if (project) {
            showCreate.value = false;
            newName.value = '';
            newDescription.value = '';
            await selectProject(project);
            router.push('/agents');
        }
    }

    async function handleSelect(project: any) {
        await selectProject(project);
        router.push('/agents');
    }

    async function handleDelete(id: string) {
        await deleteProject(id);
    }

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
</script>
