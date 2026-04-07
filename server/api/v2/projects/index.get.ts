import { listProjects } from '~/server/utils/projectStore';

export default defineEventHandler(async () => {
    return await listProjects();
});
