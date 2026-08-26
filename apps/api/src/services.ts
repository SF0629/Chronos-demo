import { pool } from "./db.js";
import type { CreateService } from "./schemas/service.js";

type ServiceRow = {
    id: string;
    name: string;
    description: string | null;
    prometheus_job: string | null;
    created_at: Date;
    updated_at: Date;
};

export type Service = {
    id: string;
    name: string;
    description: string | null;
    prometheusJob: string | null;
    createdAt: string;
    updatedAt: string;
};

function mapService(row: ServiceRow): Service {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        prometheusJob: row.prometheus_job,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

export async function listServices(): Promise<Service[]> {
    const result = await pool.query(
        `SELECT
             id,
             name,
             description,
             prometheus_job,
             created_at,
             updated_at
         FROM services
         ORDER BY name ASC, id ASC;`,
    );

    return (result.rows as ServiceRow[]).map(mapService);
}

export async function createService(input: CreateService): Promise<Service> {
    const result = await pool.query(
        `INSERT INTO services (
             name,
             description,
             prometheus_job
         )
         VALUES ($1, $2, $3)
         RETURNING
             id,
             name,
             description,
             prometheus_job,
             created_at,
             updated_at;`,
        [
            input.name,
            input.description ?? null,
            input.prometheusJob ?? null,
        ],
    );

    return mapService(result.rows[0] as ServiceRow);
}
