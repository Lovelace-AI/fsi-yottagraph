import { listEntities, replaceEntities, type ProjectEntity } from '~/server/utils/projectStore';
import { resolveEntity, resolutionResultToEntity } from '~/server/utils/resolutionPipeline';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{ entityNeids?: string[] }>(event);
    const entities = await listEntities(id);
    const targetNeids = body?.entityNeids;

    const updated: ProjectEntity[] = [];
    for (const entity of entities) {
        if (targetNeids && !targetNeids.includes(entity.neid)) {
            updated.push(entity);
            continue;
        }
        const result = await resolveEntity(entity.name, {
            ticker: entity.ticker,
            cik: entity.cik,
        });
        const resolved = resolutionResultToEntity(result, entity.sourceType, entity.rationale);
        resolved.addedAt = entity.addedAt;
        resolved.addedBy = entity.addedBy;
        updated.push(resolved);
    }

    await replaceEntities(id, updated);
    return { entities: updated, resolvedCount: updated.filter((e) => e.resolved).length };
});
