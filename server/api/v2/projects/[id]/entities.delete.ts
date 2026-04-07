import { removeEntity } from '~/server/utils/projectStore';

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id');
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Project ID required' });

    const body = await readBody<{ neid: string }>(event);
    if (!body?.neid) {
        throw createError({ statusCode: 400, statusMessage: 'Entity NEID is required' });
    }

    const entities = await removeEntity(id, body.neid);
    return { entities };
});
