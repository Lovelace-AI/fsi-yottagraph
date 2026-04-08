import { addEntity, addEntitiesBatch, type ProjectEntity } from '~/server/utils/projectStore';
import {
    resolveEntity,
    resolveBatch,
    resolutionResultToEntity,
} from '~/server/utils/resolutionPipeline';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{
        name?: string;
        batch?: { name: string; ticker?: string; cik?: string; rationale?: string }[];
        sourceType?: ProjectEntity['sourceType'];
    }>(event);

    // Batch import (from CSV or Gemini research)
    if (body?.batch && body.batch.length > 0) {
        const sourceType = body.sourceType || 'manual';
        const results = await resolveBatch(body.batch);
        const entities: ProjectEntity[] = results.map((r, i) =>
            resolutionResultToEntity(r, sourceType, body.batch![i].rationale)
        );
        const all = await addEntitiesBatch(id, entities);
        return {
            added: entities.length,
            resolved: entities.filter((e) => e.resolved).length,
            entities: all,
        };
    }

    // Single entity add
    if (!body?.name?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'Entity name is required' });
    }

    const result = await resolveEntity(body.name.trim());
    if (!result.matched) {
        throw createError({
            statusCode: 404,
            statusMessage: `Could not resolve entity "${body.name}" in the knowledge graph`,
        });
    }

    const entity = resolutionResultToEntity(result, body.sourceType || 'manual');
    const entities = await addEntity(id, entity);
    return { entity, entities };
});
