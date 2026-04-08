import { runResearchPlanner } from '~/server/utils/queryPipeline';
import { saveResearchPlan } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{
        topic: string;
        context?: string;
        geography?: string;
        timeHorizon?: string;
        template?: string;
        maxEntities?: number;
    }>(event);

    if (!body?.topic?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Research topic is required' });
    }

    const plan = await runResearchPlanner(body.topic.trim(), {
        context: body.context,
        geography: body.geography,
        timeHorizon: body.timeHorizon,
        template: body.template,
        maxEntities: body.maxEntities,
    });

    plan.projectId = id;
    await saveResearchPlan(id, plan);

    return plan;
});
