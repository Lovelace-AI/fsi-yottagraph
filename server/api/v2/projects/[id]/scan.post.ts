import { runEntityScan } from '~/server/utils/agentPipeline';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const session = await runEntityScan(id);
    return session;
});
