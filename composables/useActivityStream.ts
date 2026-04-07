/**
 * Composable for the SSE agent activity stream.
 *
 * Connects to /api/v2/agents/activity-stream and provides a reactive
 * list of activity events that the Activity Feed component renders.
 */

import { ref, readonly, onUnmounted } from 'vue';

export interface ActivityEvent {
    id: string;
    timestamp: number;
    sessionId: string;
    agentType: 'dialogue' | 'history' | 'query' | 'composition' | 'pipeline';
    action: string;
    detail?: string;
    entityName?: string;
    durationMs?: number;
    data?: Record<string, unknown>;
}

const events = ref<ActivityEvent[]>([]);
const connected = ref(false);
let eventSource: EventSource | null = null;
let refCount = 0;

function connect(): void {
    if (eventSource) return;
    eventSource = new EventSource('/api/v2/agents/activity-stream');

    eventSource.addEventListener('activity', (e) => {
        try {
            const parsed = JSON.parse(e.data) as ActivityEvent;
            events.value = [...events.value.slice(-199), parsed];
        } catch {
            // skip malformed events
        }
    });

    eventSource.onopen = () => {
        connected.value = true;
    };

    eventSource.onerror = () => {
        connected.value = false;
    };
}

function disconnect(): void {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
        connected.value = false;
    }
}

export function useActivityStream() {
    refCount++;
    connect();

    onUnmounted(() => {
        refCount--;
        if (refCount <= 0) {
            disconnect();
            refCount = 0;
        }
    });

    function clearEvents(): void {
        events.value = [];
    }

    return {
        events: readonly(events),
        connected: readonly(connected),
        clearEvents,
    };
}
