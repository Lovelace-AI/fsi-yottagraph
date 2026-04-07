import { onActivity, getRecentActivity } from '~/server/utils/activityBus';

export default defineEventHandler(async (event) => {
    setHeader(event, 'Content-Type', 'text/event-stream');
    setHeader(event, 'Cache-Control', 'no-cache');
    setHeader(event, 'Connection', 'keep-alive');

    const encoder = new TextEncoder();
    let aborted = false;

    const stream = new ReadableStream({
        start(controller) {
            event.node.req.on('close', () => {
                aborted = true;
            });

            const recent = getRecentActivity(20);
            for (const evt of recent) {
                if (aborted) return;
                try {
                    controller.enqueue(
                        encoder.encode(`event: activity\ndata: ${JSON.stringify(evt)}\n\n`)
                    );
                } catch {
                    break;
                }
            }

            const unsubscribe = onActivity((evt) => {
                if (aborted) {
                    unsubscribe();
                    return;
                }
                try {
                    controller.enqueue(
                        encoder.encode(`event: activity\ndata: ${JSON.stringify(evt)}\n\n`)
                    );
                } catch {
                    unsubscribe();
                }
            });

            const keepalive = setInterval(() => {
                if (aborted) {
                    clearInterval(keepalive);
                    unsubscribe();
                    try {
                        controller.close();
                    } catch {
                        /* already closed */
                    }
                    return;
                }
                try {
                    controller.enqueue(encoder.encode(': keepalive\n\n'));
                } catch {
                    clearInterval(keepalive);
                    unsubscribe();
                }
            }, 15000);
        },
    });

    return sendStream(event, stream);
});
