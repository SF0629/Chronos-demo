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
