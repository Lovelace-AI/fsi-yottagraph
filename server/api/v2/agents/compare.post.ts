/**
 * Side-by-side comparison endpoint.
 *
 * Runs the same question through two paths:
 * 1. Raw Gemini (no Elemental context, no tools — just the LLM)
 * 2. Contextual pipeline (Elemental data retrieval + Gemini reasoning)
 *
 * Returns both responses for side-by-side display in the UI.
 */

import { generateContent, isGeminiConfigured } from '~/server/utils/gemini';
import { emitActivity, createActivityId } from '~/server/utils/activityBus';

export default defineEventHandler(async (event) => {
    const body = await readBody<{ question: string; entityContext?: string }>(event);
    if (!body?.question?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'question is required' });
    }

    if (!isGeminiConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'NUXT_GEMINI_API_KEY not configured',
        });
    }

    const question = body.question.trim();
    const sessionId = `compare_${Date.now()}`;

    emitActivity({
        id: createActivityId(),
        timestamp: Date.now(),
        sessionId,
        agentType: 'pipeline',
        action: 'Comparison started',
        detail: question,
    });

    // Path 1: Raw Gemini — no Elemental context, no tools
    const rawStart = Date.now();
    let rawResponse: string;
    try {
        rawResponse = await generateContent(question, {
            systemInstruction:
                'You are a financial analyst. Answer the question based on your general knowledge. ' +
                'You do NOT have access to any proprietary data, knowledge graphs, or real-time data feeds. ' +
                'Be clear about what you know vs what you are uncertain about.',
        });
    } catch (e: any) {
        rawResponse = `Error: ${e.message}`;
    }
    const rawDuration = Date.now() - rawStart;

    emitActivity({
        id: createActivityId(),
        timestamp: Date.now(),
        sessionId,
        agentType: 'query',
        action: 'Raw Gemini response complete',
        detail: `${rawResponse.length} chars, no Elemental context`,
        durationMs: rawDuration,
    });

    // Path 2: Contextual — with Elemental data
    const contextStart = Date.now();
    let contextualResponse: string;
    try {
        // Fetch entity context from Elemental if we have entity info
        let elementalContext = body.entityContext || '';
        if (!elementalContext) {
            // Try to extract entity names from the question and look them up
            const { public: config } = useRuntimeConfig();
            const gw = (config as Record<string, string>).gatewayUrl;
            const org = (config as Record<string, string>).tenantOrgId;
            const apiKey = (config as Record<string, string>).qsApiKey;

            if (gw && org) {
                try {
                    const searchRes = await $fetch<any>(`${gw}/api/qs/${org}/entities/search`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(apiKey && { 'X-Api-Key': apiKey }),
                        },
                        body: {
                            queries: [{ queryId: 1, query: question }],
                            maxResults: 3,
                            includeNames: true,
                        },
                    });
                    const matches = searchRes?.results?.[0]?.matches ?? [];
                    if (matches.length > 0) {
                        const neid = matches[0].neid;
                        const propRes = await $fetch<any>(
                            `${gw}/api/qs/${org}/elemental/entities/properties`,
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    ...(apiKey && { 'X-Api-Key': apiKey }),
                                },
                                body: new URLSearchParams({
                                    eids: JSON.stringify([neid]),
                                    include_attributes: 'true',
                                }).toString(),
                            }
                        );
                        elementalContext = JSON.stringify({
                            entity: matches[0].name,
                            neid,
                            properties: (propRes?.values ?? []).slice(0, 30),
                        });
                    }
                } catch {
                    // Elemental lookup failed — proceed without context
                }
            }
        }

        const contextPrompt = elementalContext
            ? `${question}\n\n--- Elemental Knowledge Graph Context ---\n${elementalContext}`
            : question;

        contextualResponse = await generateContent(contextPrompt, {
            systemInstruction:
                'You are a financial analyst with access to the Elemental Knowledge Graph — a proprietary ' +
                'data source containing entity data, relationships, financial properties, events, and news. ' +
                'The context below contains real data from this knowledge graph. ' +
                'Use this data to provide an evidence-backed, precise answer. ' +
                'Cite specific data points from the context. ' +
                'Clearly distinguish between facts from the knowledge graph and your own reasoning.',
        });
    } catch (e: any) {
        contextualResponse = `Error: ${e.message}`;
    }
    const contextDuration = Date.now() - contextStart;

    emitActivity({
        id: createActivityId(),
        timestamp: Date.now(),
        sessionId,
        agentType: 'query',
        action: 'Contextual response complete',
        detail: `${contextualResponse.length} chars, with Elemental context`,
        durationMs: contextDuration,
    });

    return {
        question,
        raw: {
            response: rawResponse,
            durationMs: rawDuration,
            label: 'Raw Gemini (no context)',
        },
        contextual: {
            response: contextualResponse,
            durationMs: contextDuration,
            label: 'With Elemental Context',
        },
    };
});
