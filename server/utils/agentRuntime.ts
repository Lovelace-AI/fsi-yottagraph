import { extractAgentText } from '~/composables/useAgentChat';
import { extractFirstJsonObject } from './agentContract';

interface TenantAgentConfig {
    name: string;
    display_name: string;
    engine_id: string;
}

interface TenantConfigResponse {
    agents?: TenantAgentConfig[];
}

export interface AgentQueryResult {
    ok: boolean;
    agentName: string;
    agentId?: string;
    sessionId?: string | null;
    text?: string;
    error?: string;
}

let cachedAt = 0;
let cachedAgents: TenantAgentConfig[] = [];

function getGatewayConfig() {
    const config = useRuntimeConfig();
    return {
        gatewayUrl: (config.public as Record<string, string>).gatewayUrl,
        orgId: (config.public as Record<string, string>).tenantOrgId,
    };
}

async function fetchTenantAgents(): Promise<TenantAgentConfig[]> {
    const now = Date.now();
    if (cachedAgents.length > 0 && now - cachedAt < 60_000) {
        return cachedAgents;
    }

    const { gatewayUrl, orgId } = getGatewayConfig();
    if (!gatewayUrl || !orgId) return [];

    const cfg = await $fetch<TenantConfigResponse>(`${gatewayUrl}/api/config/${orgId}`, {
        timeout: 15000,
    });
    cachedAgents = cfg.agents || [];
    cachedAt = now;
    return cachedAgents;
}

export async function resolveAgentIdByName(
    preferredNames: string[]
): Promise<{ agentId?: string; agentName?: string }> {
    const agents = await fetchTenantAgents();
    for (const name of preferredNames) {
        const match = agents.find((a) => a.name === name && a.engine_id);
        if (match) {
            return { agentId: match.engine_id, agentName: match.name };
        }
    }
    const fallback = agents.find((a) => a.engine_id);
    if (fallback) {
        return { agentId: fallback.engine_id, agentName: fallback.name };
    }
    return {};
}

export async function queryDeployedAgent(
    preferredNames: string[],
    message: string,
    sessionId?: string
): Promise<AgentQueryResult> {
    const { gatewayUrl, orgId } = getGatewayConfig();
    if (!gatewayUrl || !orgId) {
        return {
            ok: false,
            agentName: preferredNames[0] || 'unknown',
            error: 'Gateway not configured',
        };
    }

    const { agentId, agentName } = await resolveAgentIdByName(preferredNames);
    if (!agentId) {
        return {
            ok: false,
            agentName: preferredNames[0] || 'unknown',
            error: 'No deployed agents discovered for tenant',
        };
    }

    try {
        const res = await $fetch<{ output: unknown; session_id?: string | null }>(
            `${gatewayUrl}/api/agents/${orgId}/${agentId}/query`,
            {
                method: 'POST',
                body: {
                    message,
                    ...(sessionId ? { session_id: sessionId } : {}),
                },
                timeout: 60000,
            }
        );

        return {
            ok: true,
            agentName: agentName || preferredNames[0] || 'unknown',
            agentId,
            sessionId: res.session_id || null,
            text: extractAgentText(res.output),
        };
    } catch (e: any) {
        return {
            ok: false,
            agentName: agentName || preferredNames[0] || 'unknown',
            agentId,
            error: e.data?.statusMessage || e.message || 'Agent query failed',
        };
    }
}

export async function queryDeployedAgentJson<T>(
    preferredNames: string[],
    message: string,
    sessionId?: string
): Promise<{ result: AgentQueryResult; json: T | null }> {
    const result = await queryDeployedAgent(preferredNames, message, sessionId);
    if (!result.ok || !result.text) {
        return { result, json: null };
    }
    const parsed = extractFirstJsonObject(result.text) as T | null;
    return { result, json: parsed };
}
