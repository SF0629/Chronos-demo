import { pool } from "./db.js";
import type { UpsertServiceBinding } from "./schemas/binding.js";

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

export type ServiceSourceBinding = {
    serviceId: string;
    source: string;
    resourceType: string;
    externalId: string;
    createdAt: string;
};

type ServiceSourceBindingRow = {
    service_id: string;
    source: string;
    resource_type: string;
    external_id: string;
    created_at: Date;
};

export async function upsertServiceBinding(
    serviceId: string,
    binding: UpsertServiceBinding,
): Promise<ServiceSourceBinding | null> {
    const result = await pool.query(
        `INSERT INTO service_source_bindings (
             service_id,
             source,
             resource_type,
             external_id
         )
         SELECT $1, $2, $3, $4
         WHERE EXISTS (
             SELECT 1
             FROM services
             WHERE id = $1
         )
         ON CONFLICT (source, resource_type, external_id)
         DO UPDATE SET service_id = EXCLUDED.service_id
         RETURNING
             service_id,
             source,
             resource_type,
             external_id,
             created_at;`,
        [
            serviceId,
            binding.source,
            binding.resourceType,
            binding.externalId,
        ],
    );

    const row = result.rows[0] as ServiceSourceBindingRow | undefined;

    if (!row) {
        return null;
    }

    return {
        serviceId: row.service_id,
        source: row.source,
        resourceType: row.resource_type,
        externalId: row.external_id,
        createdAt: row.created_at.toISOString(),
    };
}
