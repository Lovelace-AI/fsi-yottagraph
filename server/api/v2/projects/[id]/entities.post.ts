import { addEntity, type ProjectEntity } from '~/server/utils/projectStore';
import { resolveEntityName } from '~/server/utils/agentPipeline';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{ name: string }>(event);
    if (!body?.name?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Entity name is required' });
    }

    const resolved = await resolveEntityName(body.name.trim(), `resolve_${Date.now()}`);
    if (!resolved) {
        throw createError({
            statusCode: 404,
            statusMessage: `Could not resolve entity "${body.name}" in the knowledge graph`,
        });
    }

    const entity: ProjectEntity = {
        neid: resolved.neid,
        name: resolved.resolvedName,
        entityType: resolved.entityType,
        addedAt: new Date().toISOString(),
        addedBy: 'user',
    };

    const entities = await addEntity(id, entity);
    return { entity, entities };
});
