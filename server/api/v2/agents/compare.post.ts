/**
 * Side-by-side comparison endpoint.
 *
 * Runs the same question through two paths:
 * 1. Raw Gemini (no Elemental context)
 * 2. Deployed-agent contextual response (agent-first runtime path)
 */

import { generateContent, isGeminiConfigured } from '~/server/utils/gemini';
import { emitActivity, createActivityId } from '~/server/utils/activityBus';
import { queryDeployedAgentJson } from '~/server/utils/agentRuntime';
import type { AgentComparisonContract, AgentEvidenceItem } from '~/server/utils/agentContract';

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

    const contextStart = Date.now();
    let contextualResponse: string;
    let contextualEvidence: AgentEvidenceItem[] = [];

    try {
        const prompt = `Run an agent-first contextual analysis for this question:
${question}

${body.entityContext ? `Optional caller context packet:\n${body.entityContext}\n` : ''}

Return ONLY valid JSON:
{
  "answer": "Contextual answer grounded in retrieved evidence",
  "evidence": [
    {"id": "E1", "source": "what source/tool produced this", "detail": "brief evidence detail"}
  ]
}

Rules:
- Use your retrieval tools and agent context path.
- Keep evidence list concise (max 8 items).
- Do not include markdown fences.`;

        const { result, json } = await queryDeployedAgentJson<AgentComparisonContract>(
            ['credit_monitor', 'query_agent'],
            prompt
        );

        if (json?.answer) {
            contextualResponse = json.answer;
            contextualEvidence = Array.isArray(json.evidence)
                ? json.evidence
                      .map((e, idx) => ({
                          id: e.id || `E${idx + 1}`,
                          source: String(e.source || 'agent'),
                          detail: String(e.detail || ''),
                      }))
                      .slice(0, 8)
                : [];
        } else if (result.text) {
            contextualResponse = result.text;
            contextualEvidence = [];
        } else {
            throw new Error(result.error || 'Agent returned no contextual response');
        }
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
        detail: `${contextualResponse.length} chars, with Elemental evidence`,
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
            evidence: contextualEvidence,
        },
    };
});
