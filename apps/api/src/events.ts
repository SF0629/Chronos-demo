import { pool } from "./db.js";
import type { CreateEvent } from "./schemas/event.js";

export async function createEvent(event: CreateEvent) {
    const result = await pool.query(
        `INSERT INTO events (
                service_id,
                source,
                type,
                title,
                occurred_at,
                source_event_id,
                metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;`,
        [
            event.serviceId,
            event.source,
            event.type,
            event.title,
            event.occurredAt,
            event.sourceEventId ?? null,
            event.metadata ?? {},
        ],
    );

    return result.rows[0];
}
