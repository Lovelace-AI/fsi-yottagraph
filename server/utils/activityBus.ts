/**
 * In-memory SSE event bus for broadcasting agent pipeline activity.
 *
 * Server routes push activity events here; the SSE endpoint streams
 * them to connected browsers in real time.
 */

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

type Listener = (event: ActivityEvent) => void;

const listeners = new Set<Listener>();
const recentEvents: ActivityEvent[] = [];
const MAX_RECENT = 200;

export function emitActivity(event: ActivityEvent): void {
    recentEvents.push(event);
    if (recentEvents.length > MAX_RECENT) {
        recentEvents.splice(0, recentEvents.length - MAX_RECENT);
    }
    for (const listener of listeners) {
        try {
            listener(event);
        } catch {
            // listener threw — remove it
            listeners.delete(listener);
        }
    }
}

export function onActivity(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getRecentActivity(limit = 50): ActivityEvent[] {
    return recentEvents.slice(-limit);
}

export function createActivityId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
