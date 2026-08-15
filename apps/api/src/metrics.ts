import { Counter, Histogram } from "prom-client";

export const httpRequestsTotal = new Counter({
    name: "chronos_http_requests_total",
    help: "Total number of HTTP Requests handled by Chronos API",
    labelNames: ["method", "status_code"],
});

export const httpRequestDurationSeconds = new Histogram({
    name: "chronos_http_request_duration_seconds",
    help: "HTTP request duration in seconds for Chronos API",
    labelNames: ["method", "status_code"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
});
