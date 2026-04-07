import { isGeminiConfigured } from '~/server/utils/gemini';

export default defineEventHandler(() => {
    return { configured: isGeminiConfigured() };
});
