import { z } from "zod";

export const createIncidentSchema = z.object({
    serviceId: z.uuid(),
    title: z.string().trim().min(1),
});

export const incidentIdSchema = z.uuid();

export type CreateIncident = z.infer<typeof createIncidentSchema>;
