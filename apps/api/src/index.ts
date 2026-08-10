import express from "express";
import { pool } from "./db.js";
import { createEventSchema } from "./schemas/event.js";
const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
    await pool.query("SELECT 1;");

    res.json({ status: "ok", database: "connected" });
});

app.get("/events", async (req, res) => {
    const result = await pool.query(`
        SELECT *
        FROM events
        ORDER BY occurred_at DESC
        LIMIT 100;
    `);

    res.json(result.rows);
});

app.post("/events", async (req, res) => {
    const parsed = createEventSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid event",
            details: parsed.error.issues,
        });
    }

    const event = parsed.data;

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

    return res.status(201).json(result.rows[0]);
});

app.get("/services/:id/events", async (req, res) => {
    const serviceId = req.params.id;

    const result = await pool.query(
        `
        SELECT *
        FROM events
        WHERE service_id = $1
        ORDER BY occurred_at DESC
        LIMIT 100;
        `,
        [serviceId],
    );

    res.json(result.rows);
});

app.listen(4000, () => {
    console.log(`server is running at http://localhost:4000`);
});
