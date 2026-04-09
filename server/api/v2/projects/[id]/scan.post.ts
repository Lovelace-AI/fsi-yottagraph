import { runAgentFirstScan } from '~/server/utils/agentFirstScan';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const session = await runAgentFirstScan(id);
    return session;
});
