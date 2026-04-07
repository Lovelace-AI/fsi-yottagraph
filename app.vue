<template>
    <v-app class="theme-brand">
        <template v-if="showAppFramework">
            <v-navigation-drawer permanent app width="220" color="surface">
                <div class="d-flex align-center pa-4 mb-2">
                    <v-icon color="primary" size="24" class="mr-2">mdi-shield-check</v-icon>
                    <span class="text-subtitle-1 font-weight-bold text-primary"
                        >Credit Monitor</span
                    >
                </div>

                <v-divider class="mb-2" />

                <v-list nav density="compact" class="px-2">
                    <v-list-item
                        v-for="item in navItems"
                        :key="item.to"
                        :to="item.to"
                        :prepend-icon="item.icon"
                        :title="item.title"
                        :subtitle="item.subtitle"
                        rounded="lg"
                        class="mb-1"
                    />
                </v-list>

                <template #append>
                    <v-divider class="mb-2" />
                    <v-list nav density="compact" class="px-2">
                        <v-list-item
                            to="/settings"
                            prepend-icon="mdi-cog-outline"
                            title="Settings"
                            rounded="lg"
                        />
                    </v-list>
                    <div class="pa-3">
                        <ServerStatusFooter />
                    </div>
                </template>
            </v-navigation-drawer>

            <v-main class="fill-height">
                <NuxtPage />
            </v-main>

            <v-dialog v-model="state.showSettingsDialog" max-width="600">
                <SettingsDialog />
            </v-dialog>

            <NotificationContainer />
        </template>
        <template v-else>
            <NuxtPage />
        </template>
    </v-app>
</template>

<script setup lang="ts">
    import { state } from './utils/appState';

    const route = useRoute();
    const { userName } = useUserState();

    const noFrameworkRoutes = ['/login', '/a0callback', '/logout', '/pending'];

    const navItems = [
        {
            to: '/',
            icon: 'mdi-folder-multiple-outline',
            title: 'Projects',
            subtitle: 'Manage entity lists',
        },
        {
            to: '/agents',
            icon: 'mdi-robot-outline',
            title: 'Agents',
            subtitle: 'Pipeline activity',
        },
        {
            to: '/data-explorer',
            icon: 'mdi-table-search',
            title: 'Data Explorer',
            subtitle: 'Entity views',
        },
        {
            to: '/dashboard',
            icon: 'mdi-chart-areaspline',
            title: 'Dashboard',
            subtitle: 'Risk overview',
        },
    ];

    const showAppFramework = computed(() => {
        if (noFrameworkRoutes.includes(route.path)) {
            return false;
        }
        if (!userName.value) {
            return false;
        }
        return true;
    });
</script>
