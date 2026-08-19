import express from "express";
import { Counter, Histogram, Registry } from "prom-client";

const DEFAULT_PORT = 4100;
const DEFAULT_DELAY_MS = 20;

function readNonNegativeNumber(name: string, fallback: number): number {
    const rawValue = process.env[name];

    if (rawValue === undefined || rawValue.trim() === "") {
        return fallback;
    }

    const value = Number(rawValue);

    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative number`);
    }

    return value;
}

const port = readNonNegativeNumber("PORT", DEFAULT_PORT);
const delayMs = readNonNegativeNumber("DEMO_DELAY_MS", DEFAULT_DELAY_MS);

const registry = new Registry();

const httpRequestsTotal = new Counter({
    name: "demo_http_requests_total",
    help: "Total number of demo workload HTTP requests",
    labelNames: ["method", "status_code"],
    registers: [registry],
});

const httpRequestDurationSeconds = new Histogram({
    name: "demo_http_request_duration_seconds",
    help: "Demo workload HTTP request duration in seconds",
    labelNames: ["method", "status_code"],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.75, 1, 2],
    registers: [registry],
});

const app = express();

app.get("/health", (_request, response) => {
    response.json({
        status: "ok",
        delayMs,
    });
});

app.get("/work", async (request, response) => {
    const startedAt = process.hrtime.bigint();

    await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
    });

    const durationSeconds =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
    const labels = {
        method: request.method,
        status_code: "200",
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);

    response.json({
        status: "ok",
        delayMs,
    });
});

app.get("/metrics", async (_request, response) => {
    response.setHeader("Content-Type", registry.contentType);
    response.end(await registry.metrics());
});

app.listen(port, "0.0.0.0", () => {
    console.log(
        `[demo-app] listening on port ${port} with DEMO_DELAY_MS=${delayMs}`,
    );
});
