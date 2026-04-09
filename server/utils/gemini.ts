/**
 * Gemini AI client wrapper for server-side reasoning.
 *
 * Used by the TypeScript pipeline orchestrator to call Gemini for
 * analytical reasoning (FHS/ERS scoring, narrative generation) when
 * the full ADK agent isn't needed.
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
    if (_genAI) return _genAI;
    const apiKey =
        process.env.NUXT_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error(
            'NUXT_GEMINI_API_KEY not configured. Add it to .env to enable agent reasoning.'
        );
    }
    _genAI = new GoogleGenerativeAI(apiKey);
    return _genAI;
}

export function getGeminiModel(model = 'gemini-2.0-flash'): GenerativeModel {
    return getGenAI().getGenerativeModel({ model });
}

export function isGeminiConfigured(): boolean {
    return Boolean(
        process.env.NUXT_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    );
}

export async function generateContent(
    prompt: string,
    options?: { model?: string; systemInstruction?: string; temperature?: number }
): Promise<string> {
    const model = getGeminiModel(options?.model);
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(options?.systemInstruction && {
            systemInstruction: { role: 'system', parts: [{ text: options.systemInstruction }] },
        }),
        ...(options?.temperature !== undefined && {
            generationConfig: { temperature: options.temperature },
        }),
    });
    return result.response.text();
}
