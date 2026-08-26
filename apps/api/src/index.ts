import express from "express";
import { pool } from "./db.js";
import { createEventSchema } from "./schemas/event.js";
import { createIncidentSchema, incidentIdSchema } from "./schemas/incident.js";
import { createServiceSchema, serviceIdSchema } from "./schemas/service.js";
import { upsertServiceBindingSchema } from "./schemas/binding.js";
import {
    normalizeGitHubPush,
    type GitHubPushPayload,
    verifyGitHubSignature,
} from "./github.js";
import { resolveServiceBinding, upsertServiceBinding } from "./bindings.js";
import { createEvent } from "./events.js";
import { createService, listServices } from "./services.js";
import {
    createIncident,
    getIncidentDetail,
    listIncidents,
    resolveIncident,
} from "./incidents.js";
import { getIncidentCorrelation } from "./correlation.js";
import { httpRequestDurationSeconds, httpRequestsTotal } from "./metrics.js";
import {
    PrometheusClientError,
    queryPrometheusRange,
} from "./prometheus.js";
import {
    getHttpLatencyMetricSummary,
    getJobScopedHttpLatencyMetricSummary,
    MetricSummaryUnavailableError,
} from "./metric-summary.js";
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

app.get("/metrics/query-range", async (req, res) => {
    const query =
        typeof req.query.query === "string"
            ? req.query.query.trim()
            : "";

    const start =
        typeof req.query.start === "string"
            ? req.query.start.trim()
            : "";

    const end =
        typeof req.query.end === "string"
            ? req.query.end.trim()
            : "";

    const step =
        typeof req.query.step === "string"
            ? req.query.step.trim()
            : "";

    if (!query || !start || !end || !step) {
        return res.status(400).json({
            error: "query, start, end, and step are required",
        });
    }

    try {
        const data = await queryPrometheusRange({
            query,
            start,
            end,
            step,
        });

        return res.json({
            query,
            start,
            end,
            step,
            resultType: data.resultType,
            series: data.result,
        });
    } catch (error) {
        if (error instanceof PrometheusClientError) {
            return res.status(error.statusCode).json({
                error: error.message,
                ...(error.errorType
                    ? { errorType: error.errorType }
                    : {}),
            });
        }

        console.error("[prometheus] unexpected query_range error", error);

        return res.status(502).json({
            error: "Prometheus query failed",
        });
    }
});

app.get("/metrics/summary", async (req, res) => {
    const incidentAtRaw =
        typeof req.query.incidentAt === "string"
            ? req.query.incidentAt.trim()
            : "";

    const windowSecondsRaw =
        typeof req.query.windowSeconds === "string"
            ? req.query.windowSeconds.trim()
            : "";

    if (!incidentAtRaw) {
        return res.status(400).json({
            error: "incidentAt is required",
        });
    }

    if (!windowSecondsRaw) {
        return res.status(400).json({
            error: "windowSeconds is required",
        });
    }

    const incidentAt = Number(incidentAtRaw);
    const windowSeconds = Number(windowSecondsRaw);

    if (!Number.isFinite(incidentAt)) {
        return res.status(400).json({
            error: "incidentAt must be a finite number",
        });
    }

    if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
        return res.status(400).json({
            error: "windowSeconds must be a positive integer",
        });
    }

    try {
        const summary = await getHttpLatencyMetricSummary(
            incidentAt,
            windowSeconds,
        );

        return res.json(summary);
    } catch (error) {
        if (error instanceof MetricSummaryUnavailableError) {
            return res.status(422).json({
                error: error.message,
            });
        }

        if (error instanceof PrometheusClientError) {
            return res.status(error.statusCode).json({
                error: error.message,
                ...(error.errorType
                    ? { errorType: error.errorType }
                    : {}),
            });
        }

        console.error("[metrics] unexpected metric summary error", error);

        return res.status(500).json({
            error: "Metric summary failed",
        });
    }
});

app.get("/health", async (req, res) => {
    await pool.query("SELECT 1;");

    res.json({ status: "ok", database: "connected" });
});

app.get("/services", async (_req, res) => {
    const services = await listServices();

    return res.status(200).json(services);
});

app.post("/services", async (req, res) => {
    const parsed = createServiceSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid service",
            details: parsed.error.issues,
        });
    }

    const service = await createService(parsed.data);

    return res.status(201).json(service);
});

app.put("/services/:id/source-bindings", async (req, res) => {
    const parsedId = serviceIdSchema.safeParse(req.params.id);

    if (!parsedId.success) {
        return res.status(400).json({
            error: "Invalid service id",
        });
    }

    const parsedBinding = upsertServiceBindingSchema.safeParse(req.body);

    if (!parsedBinding.success) {
        return res.status(400).json({
            error: "Invalid service source binding",
            details: parsedBinding.error.issues,
        });
    }

    const binding = await upsertServiceBinding(
        parsedId.data,
        parsedBinding.data,
    );

    if (!binding) {
        return res.status(404).json({
            error: "Service not found",
        });
    }

    return res.status(200).json(binding);
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

app.get("/incidents", async (_req, res) => {
    const incidents = await listIncidents();

    return res.status(200).json(incidents);
});

app.post("/incidents", async (req, res) => {
    const parsed = createIncidentSchema.safeParse(req.body);

    if (!parsed.success) {
        return res.status(400).json({
            error: "Invalid incident",
            details: parsed.error.issues,
        });
    }

    const incident = await createIncident(parsed.data);

    if (!incident) {
        return res.status(404).json({
            error: "Service not found",
        });
    }

    return res.status(201).json(incident);
});

app.get("/incidents/:id", async (req, res) => {
    const parsedId = incidentIdSchema.safeParse(req.params.id);

    if (!parsedId.success) {
        return res.status(400).json({
            error: "Invalid incident id",
        });
    }

    const incident = await getIncidentDetail(parsedId.data);

    if (!incident) {
        return res.status(404).json({
            error: "Incident not found",
        });
    }

    return res.status(200).json(incident);
});

app.get("/incidents/:id/metric-summary", async (req, res) => {
    const parsedId = incidentIdSchema.safeParse(req.params.id);

    if (!parsedId.success) {
        return res.status(400).json({
            error: "Invalid incident id",
        });
    }

    const windowSecondsRaw =
        typeof req.query.windowSeconds === "string"
            ? req.query.windowSeconds.trim()
            : "";

    const windowSeconds = Number(windowSecondsRaw);

    if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
        return res.status(400).json({
            error: "windowSeconds must be a positive integer",
        });
    }

    const incident = await getIncidentDetail(parsedId.data);

    if (!incident) {
        return res.status(404).json({
            error: "Incident not found",
        });
    }

    if (!incident.prometheusJob) {
        return res.status(422).json({
            error: "Incident service has no Prometheus job",
        });
    }

    const incidentAt = new Date(incident.startedAt).getTime() / 1000;

    try {
        const summary = await getJobScopedHttpLatencyMetricSummary(
            incidentAt,
            windowSeconds,
            incident.prometheusJob,
        );

        return res.status(200).json(summary);
    } catch (error) {
        if (error instanceof MetricSummaryUnavailableError) {
            return res.status(422).json({
                error: error.message,
            });
        }

        if (error instanceof PrometheusClientError) {
            return res.status(error.statusCode).json({
                error: error.message,
                ...(error.errorType
                    ? { errorType: error.errorType }
                    : {}),
            });
        }

        console.error(
            "[metrics] unexpected incident metric summary error",
            error,
        );

        return res.status(500).json({
            error: "Incident metric summary failed",
        });
    }
});

app.post("/incidents/:id/resolve", async (req, res) => {
    const parsedId = incidentIdSchema.safeParse(req.params.id);

    if (!parsedId.success) {
        return res.status(400).json({
            error: "Invalid incident id",
        });
    }

    const result = await resolveIncident(parsedId.data);

    if (result.kind === "not_found") {
        return res.status(404).json({
            error: "Incident not found",
        });
    }

    if (result.kind === "already_resolved") {
        return res.status(409).json({
            error: "Incident already resolved",
        });
    }

    return res.status(200).json(result.incident);
});

app.get("/incidents/:id/correlation", async (req, res) => {
    const parsedId = incidentIdSchema.safeParse(req.params.id);

    if (!parsedId.success) {
        return res.status(400).json({
            error: "Invalid incident id",
        });
    }

    const correlation = await getIncidentCorrelation(parsedId.data);

    if (!correlation) {
        return res.status(404).json({
            error: "Incident not found",
        });
    }

    return res.status(200).json(correlation);
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
