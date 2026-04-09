<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-6 pb-2">
            <PageHeader title="Projects" subtitle="Create and manage entity monitoring lists" />
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-6 pt-2">
            <div class="d-flex align-center mb-4">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="startCreate">
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
                <v-btn color="primary" prepend-icon="mdi-plus" @click="startCreate">
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
                                {{ formatDate(project.createdAt) }}
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
                                variant="text"
                                icon="mdi-pencil-outline"
                                @click.stop="startEdit(project)"
                            />
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

        <!-- Edit Project Dialog -->
        <v-dialog v-model="showEdit" max-width="500">
            <v-card>
                <v-card-title>Edit Project</v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="editName"
                        label="Project name"
                        variant="outlined"
                        density="comfortable"
                        class="mb-2"
                    />
                    <v-textarea
                        v-model="editDescription"
                        label="Description"
                        rows="2"
                        variant="outlined"
                        density="comfortable"
                    />
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="showEdit = false">Cancel</v-btn>
                    <v-btn
                        color="primary"
                        :disabled="!editName.trim()"
                        :loading="saving"
                        @click="saveEdit"
                    >
                        Save
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Wizard-style Create Dialog -->
        <v-dialog v-model="showCreate" max-width="700">
            <!-- Step 1: Name + ingestion path -->
            <v-card v-if="wizardStep === 1">
                <v-card-title>New Project</v-card-title>
                <v-card-text>
                    <v-text-field
                        v-model="newName"
                        label="Project name"
                        placeholder="e.g. Q2 Credit Review"
                        variant="outlined"
                        density="comfortable"
                        class="mb-2"
                    />
                    <v-textarea
                        v-model="newDescription"
                        label="Description (optional)"
                        rows="2"
                        placeholder="Brief description of this monitoring project"
                        variant="outlined"
                        density="comfortable"
                        class="mb-4"
                    />

                    <div class="text-subtitle-2 mb-3">How would you like to add entities?</div>
                    <v-row>
                        <v-col cols="12" sm="4">
                            <v-card
                                :variant="ingestionPath === 'empty' ? 'flat' : 'outlined'"
                                :color="ingestionPath === 'empty' ? 'surface-variant' : undefined"
                                class="cursor-pointer text-center pa-4"
                                @click="ingestionPath = 'empty'"
                            >
                                <v-icon size="32" class="mb-2">mdi-text-box-outline</v-icon>
                                <div class="text-body-2 font-weight-medium">Empty List</div>
                                <div class="text-caption text-grey">Add entities later</div>
                            </v-card>
                        </v-col>
                        <v-col cols="12" sm="4">
                            <v-card
                                :variant="ingestionPath === 'csv' ? 'flat' : 'outlined'"
                                :color="ingestionPath === 'csv' ? 'surface-variant' : undefined"
                                class="cursor-pointer text-center pa-4"
                                @click="ingestionPath = 'csv'"
                            >
                                <v-icon size="32" class="mb-2">mdi-file-upload-outline</v-icon>
                                <div class="text-body-2 font-weight-medium">Upload CSV</div>
                                <div class="text-caption text-grey">Bulk import entities</div>
                            </v-card>
                        </v-col>
                        <v-col cols="12" sm="4">
                            <v-card
                                :variant="ingestionPath === 'research' ? 'flat' : 'outlined'"
                                :color="
                                    ingestionPath === 'research' ? 'surface-variant' : undefined
                                "
                                class="cursor-pointer text-center pa-4"
                                @click="ingestionPath = 'research'"
                            >
                                <v-icon size="32" color="primary" class="mb-2">mdi-creation</v-icon>
                                <div class="text-body-2 font-weight-medium">Gemini Research</div>
                                <div class="text-caption text-grey">AI-powered discovery</div>
                            </v-card>
                        </v-col>
                    </v-row>
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
                        {{ ingestionPath === 'empty' ? 'Create' : 'Next' }}
                    </v-btn>
                </v-card-actions>
            </v-card>

            <!-- Step 2: CSV Upload -->
            <ProjectsCsvUploadDialog
                v-if="wizardStep === 2 && ingestionPath === 'csv' && createdProject"
                :project-id="createdProject.id"
                @cancel="finishWizard"
                @imported="handleImported"
            />

            <!-- Step 2: Gemini Research -->
            <ProjectsGeminiResearchPanel
                v-if="wizardStep === 2 && ingestionPath === 'research' && createdProject"
                :project-id="createdProject.id"
                @cancel="finishWizard"
                @imported="handleImported"
            />
        </v-dialog>

        <ProjectsProjectDetailDialog
            v-model="showProjectDetail"
            :project="selectedProject"
            @update:model-value="handleProjectDetailVisibility"
        />
    </div>
</template>

<script setup lang="ts">
    const { projects, loading, error, fetchProjects, createProject, selectProject, deleteProject } =
        useProject();

    const showCreate = ref(false);
    const wizardStep = ref(1);
    const ingestionPath = ref<'empty' | 'csv' | 'research'>('empty');
    const newName = ref('');
    const newDescription = ref('');
    const creating = ref(false);
    const createdProject = ref<any>(null);

    const showEdit = ref(false);
    const editProjectId = ref('');
    const editName = ref('');
    const editDescription = ref('');
    const saving = ref(false);
    const showProjectDetail = ref(false);
    const selectedProject = ref<any>(null);

    onMounted(() => {
        fetchProjects();
    });

    function startCreate() {
        wizardStep.value = 1;
        ingestionPath.value = 'empty';
        newName.value = '';
        newDescription.value = '';
        createdProject.value = null;
        showCreate.value = true;
    }

    async function handleCreate() {
        if (!newName.value.trim()) return;
        creating.value = true;
        const project = await createProject(newName.value.trim(), newDescription.value.trim());
        creating.value = false;

        if (!project) return;
        createdProject.value = project;

        if (ingestionPath.value === 'empty') {
            await selectProject(project);
            showCreate.value = false;
            openProjectDetail(project);
        } else {
            wizardStep.value = 2;
        }
    }

    async function handleImported(count: number) {
        if (createdProject.value) {
            await selectProject(createdProject.value);
            openProjectDetail(createdProject.value);
        }
        showCreate.value = false;
    }

    function finishWizard() {
        if (createdProject.value) {
            selectProject(createdProject.value);
            openProjectDetail(createdProject.value);
        }
        showCreate.value = false;
    }

    async function handleSelect(project: any) {
        await selectProject(project);
        openProjectDetail(project);
    }

    function startEdit(project: any) {
        editProjectId.value = project.id;
        editName.value = project.name;
        editDescription.value = project.description || '';
        showEdit.value = true;
    }

    async function saveEdit() {
        if (!editName.value.trim()) return;
        saving.value = true;
        try {
            await $fetch(`/api/v2/projects/${editProjectId.value}`, {
                method: 'PATCH',
                body: { name: editName.value.trim(), description: editDescription.value.trim() },
            });
            await fetchProjects();
            showEdit.value = false;
        } catch {
            // handled
        }
        saving.value = false;
    }

    async function handleDelete(id: string) {
        await deleteProject(id);
        if (selectedProject.value?.id === id) {
            selectedProject.value = null;
            showProjectDetail.value = false;
        }
    }

    function openProjectDetail(project: any) {
        selectedProject.value = project;
        showProjectDetail.value = true;
    }

    function handleProjectDetailVisibility(isVisible: boolean) {
        showProjectDetail.value = isVisible;
        if (!isVisible) {
            selectedProject.value = null;
        }
    }

    function formatDate(iso: string): string {
        return new Date(iso).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    }
</script>

<style scoped>
    .cursor-pointer {
        cursor: pointer;
    }
</style>
