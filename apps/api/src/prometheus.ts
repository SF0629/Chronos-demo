const DEFAULT_PROMETHEUS_URL = "http://localhost:9090";

type PrometheusQueryRangeParams = {
    query: string;
    start: string;
    end: string;
    step: string;
};

export type PrometheusRangeSeries = {
    metric: Record<string, string>;
    values: Array<[number, string]>;
};

export type PrometheusRangeData = {
    resultType: "matrix";
    result: PrometheusRangeSeries[];
};

export class PrometheusClientError extends Error {
    readonly statusCode: number;
    readonly errorType: string | undefined;

    constructor(
        message: string,
        statusCode: number,
        errorType: string | undefined = undefined,
    ) {
        super(message);
        this.name = "PrometheusClientError";
        this.statusCode = statusCode;
        this.errorType = errorType;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetricLabels(value: unknown): Record<string, string> | null {
    if (!isRecord(value)) {
        return null;
    }

    const labels: Record<string, string> = {};

    for (const [key, labelValue] of Object.entries(value)) {
        if (typeof labelValue !== "string") {
            return null;
        }

        labels[key] = labelValue;
    }

    return labels;
}

function parseSample(value: unknown): [number, string] | null {
    if (!Array.isArray(value) || value.length !== 2) {
        return null;
    }

    const timestamp = value[0];
    const sampleValue = value[1];

    if (
        typeof timestamp !== "number" ||
        !Number.isFinite(timestamp) ||
        typeof sampleValue !== "string"
    ) {
        return null;
    }

    return [timestamp, sampleValue];
}

function parseRangeData(value: unknown): PrometheusRangeData | null {
    if (!isRecord(value) || value.resultType !== "matrix") {
        return null;
    }

    if (!Array.isArray(value.result)) {
        return null;
    }

    const result: PrometheusRangeSeries[] = [];

    for (const item of value.result) {
        if (!isRecord(item) || !Array.isArray(item.values)) {
            return null;
        }

        const metric = parseMetricLabels(item.metric);

        if (!metric) {
            return null;
        }

        const values: Array<[number, string]> = [];

        for (const sample of item.values) {
            const parsedSample = parseSample(sample);

            if (!parsedSample) {
                return null;
            }

            values.push(parsedSample);
        }

        result.push({ metric, values });
    }

    return {
        resultType: "matrix",
        result,
    };
}

function upstreamErrorStatus(statusCode: number): number {
    if (statusCode === 400 || statusCode === 422) {
        return 400;
    }

    return 502;
}

export async function queryPrometheusRange(
    params: PrometheusQueryRangeParams,
): Promise<PrometheusRangeData> {
    const baseUrl =
        process.env.PROMETHEUS_URL ?? DEFAULT_PROMETHEUS_URL;

    let url: URL;

    try {
        url = new URL("/api/v1/query_range", baseUrl);
    } catch {
        throw new PrometheusClientError(
            "Prometheus URL is not configured correctly",
            500,
        );
    }

    url.searchParams.set("query", params.query);
    url.searchParams.set("start", params.start);
    url.searchParams.set("end", params.end);
    url.searchParams.set("step", params.step);

    let response: Response;

    try {
        response = await fetch(url);
    } catch {
        throw new PrometheusClientError(
            "Unable to reach Prometheus",
            502,
        );
    }

    let payload: unknown;

    try {
        payload = await response.json();
    } catch {
        throw new PrometheusClientError(
            "Prometheus returned an invalid JSON response",
            502,
        );
    }

    if (!isRecord(payload) || typeof payload.status !== "string") {
        throw new PrometheusClientError(
            "Prometheus returned an invalid response",
            502,
        );
    }

    if (payload.status === "error") {
        const message =
            typeof payload.error === "string"
                ? payload.error
                : "Prometheus query failed";

        const errorType =
            typeof payload.errorType === "string"
                ? payload.errorType
                : undefined;

        throw new PrometheusClientError(
            message,
            upstreamErrorStatus(response.status),
            errorType,
        );
    }

    if (!response.ok || payload.status !== "success") {
        throw new PrometheusClientError(
            "Prometheus query failed",
            upstreamErrorStatus(response.status),
        );
    }

    const data = parseRangeData(payload.data);

    if (!data) {
        throw new PrometheusClientError(
            "Prometheus returned an unexpected range query result",
            502,
        );
    }

    return data;
}
