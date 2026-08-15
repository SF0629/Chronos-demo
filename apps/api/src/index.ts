import express from "express";
import { pool } from "./db.js";
import { createEventSchema } from "./schemas/event.js";
import {
    normalizeGitHubPush,
    type GitHubPushPayload,
    verifyGitHubSignature,
} from "./github.js";
import { resolveServiceBinding } from "./bindings.js";
import { createEvent } from "./events.js";
import { httpRequestDurationSeconds, httpRequestsTotal } from "./metrics.js";
import { register } from "prom-client";

const app = express();

app.use((req, res, next) => {
    if (req.path === "/metrics") {
        return next();
    }

    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
        const method = req.method;
        const statusCode = String(res.statusCode);

        httpRequestsTotal.inc({
            method,
            status_code: statusCode,
        });

        const durationSeconds =
            Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

        httpRequestDurationSeconds.observe(
            {
                method,
                status_code: statusCode,
            },
            durationSeconds,
        );
    });

    next();
});

app.post(
    "/webhooks/github",
    express.raw({ type: "application/json" }),
    async (req, res) => {
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

        if (eventType === "push") {
            const githubPush = payload as GitHubPushPayload;

            const serviceId = await resolveServiceBinding(
                "github",
                "repository",
                githubPush.repository.full_name,
            );

            if (!serviceId) {
                console.log(
                    `[github] no service binding for repository: ${githubPush.repository.full_name}`,
                );
                return res.status(200).json();
            }

            const event = normalizeGitHubPush(
                githubPush,
                deliveryId,
                serviceId,
            );

            if (event) {
                const savedEvent = await createEvent(event);

                console.log("github event: ", savedEvent);
            }
        }

        return res.status(200).json({ status: "success" });
    },
);

app.use(express.json());

app.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
});

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

    const result = await createEvent(parsed.data);

    return res.status(201).json(result);
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
