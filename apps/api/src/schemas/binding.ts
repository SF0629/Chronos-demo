import { z } from "zod";

export const upsertServiceBindingSchema = z.object({
    source: z.string().trim().min(1).max(100),
    resourceType: z.string().trim().min(1).max(100),
    externalId: z.string().trim().min(1).max(255),
});

export type UpsertServiceBinding = z.infer<
    typeof upsertServiceBindingSchema
>;
