import { z } from "zod";

export const createEventSchema = z.object({
    serviceId: z.uuid(),
    source: z.string().min(1).max(100),
    type: z.string().min(1).max(100),
    title: z.string().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
    sourceEventId: z.string().max(255).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateEvent = z.infer<typeof createEventSchema>;
