import { z } from "zod";

export const createServiceSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().optional(),
    prometheusJob: z.string().trim().min(1).max(100).optional(),
});

export const serviceIdSchema = z.uuid();

export type CreateService = z.infer<typeof createServiceSchema>;
