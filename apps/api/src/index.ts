import express from "express";
import { pool } from "./db.js";
import { createEventSchema } from "./schemas/event.js";
import { verifyGitHubSignature } from "./github.js";

const app = express();

app.post(
    "/webhooks/github",
    express.raw({ type: "application/json" }),
    (req, res) => {
        const secret = process.env.GITHUB_WEBHOOK_SECRET;
        const signature = req.get("x-hub-signature-256");

        if (!secret) {
            return res
                .status(500)
                .json({ error: "GitHub webhook secret is not configured" });
        }

        if (!signature) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        if (!Buffer.isBuffer(req.body)) {
            return res.status(400).json({ error: "Invalid webhook body" });
        }

        if (!verifyGitHubSignature(req.body, signature, secret)) {
            return res.status(401).json({ error: "Invalid signature" });
        }

        let payload;

        try {
            payload = JSON.parse(req.body.toString("utf8"));
        } catch {
            return res.status(400).json({ error: "Invalid JSON payload" });
        }

        const eventType = req.get("x-github-event");
        const deliveryId = req.get("x-github-delivery");

        if (!eventType) {
            return res.status(400).json({ error: "Invalid eventType" });
        }

        if (!deliveryId) {
            return res.status(400).json({ error: "Invalid delivery" });
        }

        console.log({ eventType, deliveryId, payload });
        return res.status(200).json({ status: "success" });
    },
);

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
