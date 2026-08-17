import {
    queryPrometheusRange,
    type PrometheusRangeData,
} from "./prometheus.js";

const LATENCY_SUM_QUERY =
    "sum(chronos_http_request_duration_seconds_sum)";

const LATENCY_COUNT_QUERY =
    "sum(chronos_http_request_duration_seconds_count)";

const QUERY_STEP = "15s";

type MetricWindowSummary = {
    start: number;
    end: number;
    averageLatency: number;
    requestCount: number;
};

export type HttpLatencyMetricSummary = {
    metric: "http_request_duration_seconds";
    unit: "seconds";
    incidentAt: number;
    windowSeconds: number;
    before: MetricWindowSummary;
    after: MetricWindowSummary;
};

export class MetricSummaryUnavailableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MetricSummaryUnavailableError";
    }
}

function getCounterDelta(
    data: PrometheusRangeData,
    counterName: string,
): number {
    if (data.result.length !== 1) {
        throw new MetricSummaryUnavailableError(
            `Expected one aggregate series for ${counterName}`,
        );
    }

    const series = data.result[0];

    if (!series || series.values.length < 2) {
        throw new MetricSummaryUnavailableError(
            `Not enough samples for ${counterName}`,
        );
    }

    const values = series.values.map(([, value]) => Number(value));

    if (values.some((value) => !Number.isFinite(value))) {
        throw new MetricSummaryUnavailableError(
            `Invalid numeric sample for ${counterName}`,
        );
    }

    for (let index = 1; index < values.length; index += 1) {
        const previous = values[index - 1];
        const current = values[index];

        if (
            previous === undefined ||
            current === undefined ||
            current < previous
        ) {
            throw new MetricSummaryUnavailableError(
                `Counter reset or decrease detected for ${counterName}`,
            );
        }
    }

    const first = values[0];
    const last = values[values.length - 1];

    if (first === undefined || last === undefined) {
        throw new MetricSummaryUnavailableError(
            `Not enough samples for ${counterName}`,
        );
    }

    return last - first;
}

async function calculateWindow(
    start: number,
    end: number,
): Promise<MetricWindowSummary> {
    const [sumData, countData] = await Promise.all([
        queryPrometheusRange({
            query: LATENCY_SUM_QUERY,
            start: String(start),
            end: String(end),
            step: QUERY_STEP,
        }),
        queryPrometheusRange({
            query: LATENCY_COUNT_QUERY,
            start: String(start),
            end: String(end),
            step: QUERY_STEP,
        }),
    ]);

    const sumDelta = getCounterDelta(
        sumData,
        "chronos_http_request_duration_seconds_sum",
    );

    const countDelta = getCounterDelta(
        countData,
        "chronos_http_request_duration_seconds_count",
    );

    if (countDelta <= 0) {
        throw new MetricSummaryUnavailableError(
            "No requests occurred in the metric window",
        );
    }

    const averageLatency = sumDelta / countDelta;

    if (!Number.isFinite(averageLatency) || averageLatency < 0) {
        throw new MetricSummaryUnavailableError(
            "Unable to calculate average latency",
        );
    }

    return {
        start,
        end,
        averageLatency,
        requestCount: countDelta,
    };
}

export async function getHttpLatencyMetricSummary(
    incidentAt: number,
    windowSeconds: number,
): Promise<HttpLatencyMetricSummary> {
    const beforeStart = incidentAt - windowSeconds;
    const beforeEnd = incidentAt;

    const afterStart = incidentAt;
    const afterEnd = incidentAt + windowSeconds;

    const [before, after] = await Promise.all([
        calculateWindow(beforeStart, beforeEnd),
        calculateWindow(afterStart, afterEnd),
    ]);

    return {
        metric: "http_request_duration_seconds",
        unit: "seconds",
        incidentAt,
        windowSeconds,
        before,
        after,
    };
}
