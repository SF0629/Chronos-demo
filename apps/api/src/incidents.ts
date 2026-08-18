import { pool } from "./db.js";
import type { CreateIncident } from "./schemas/incident.js";

export async function createIncident(incident: CreateIncident) {
    const result = await pool.query(
        `INSERT INTO incidents (
                service_id,
                title,
                status,
                started_at,
                resolved_at,
                trigger_type
            )
            SELECT id, $2, 'open', CURRENT_TIMESTAMP, NULL, 'manual'
            FROM services
            WHERE id = $1
            RETURNING *;`,
        [incident.serviceId, incident.title],
    );

    return result.rows[0] ?? null;
}

type ResolveIncidentResult =
    | { kind: "resolved"; incident: unknown }
    | { kind: "not_found" }
    | { kind: "already_resolved" };

export async function resolveIncident(
    incidentId: string,
): Promise<ResolveIncidentResult> {
    const updateResult = await pool.query(
        `UPDATE incidents
         SET status = 'resolved',
             resolved_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status = 'open'
         RETURNING *;`,
        [incidentId],
    );

    const resolvedIncident = updateResult.rows[0];

    if (resolvedIncident) {
        return { kind: "resolved", incident: resolvedIncident };
    }

    const existingResult = await pool.query(
        `SELECT status
         FROM incidents
         WHERE id = $1;`,
        [incidentId],
    );

    if (existingResult.rows.length === 0) {
        return { kind: "not_found" };
    }

    return { kind: "already_resolved" };
}

type IncidentDetailRow = {
    id: string;
    service_id: string;
    service_name: string;
    title: string;
    status: "open" | "resolved";
    started_at: Date;
    resolved_at: Date | null;
    trigger_type: string;
};

export type IncidentDetail = {
    id: string;
    serviceId: string;
    serviceName: string;
    title: string;
    status: "open" | "resolved";
    startedAt: string;
    resolvedAt: string | null;
    triggerType: string;
};

export async function getIncidentDetail(
    incidentId: string,
): Promise<IncidentDetail | null> {
    const result = await pool.query(
        `SELECT
             incidents.id,
             incidents.service_id,
             services.name AS service_name,
             incidents.title,
             incidents.status,
             incidents.started_at,
             incidents.resolved_at,
             incidents.trigger_type
         FROM incidents
         JOIN services ON services.id = incidents.service_id
         WHERE incidents.id = $1;`,
        [incidentId],
    );

    const incident = result.rows[0] as IncidentDetailRow | undefined;

    if (!incident) {
        return null;
    }

    return {
        id: incident.id,
        serviceId: incident.service_id,
        serviceName: incident.service_name,
        title: incident.title,
        status: incident.status,
        startedAt: incident.started_at.toISOString(),
        resolvedAt: incident.resolved_at?.toISOString() ?? null,
        triggerType: incident.trigger_type,
    };
}
