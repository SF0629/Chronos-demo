import { pool } from "./db.js";

export async function resolveServiceBinding(
    source: string,
    resourceType: string,
    externalId: string,
): Promise<string | undefined> {
    const result = await pool.query(
        `SELECT service_id FROM service_source_bindings WHERE source = $1 and resource_type = $2 and external_id = $3`,
        [source, resourceType, externalId],
    );

    const serviceId = result.rows[0]?.service_id;

    if (!serviceId) {
        return;
    }

    return serviceId;
}
