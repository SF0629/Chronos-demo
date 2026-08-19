import {
    queryPrometheusRange,
    type PrometheusRangeData,
} from "./prometheus.js";

const LATENCY_SUM_QUERY =
    "sum(chronos_http_request_duration_seconds_sum)";

const LATENCY_COUNT_QUERY =
    "sum(chronos_http_request_duration_seconds_count)";

const QUERY_STEP = "15s";
const JOB_SCOPED_QUERY_STEP = "5s";

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

function getSingleCounterValues(
    data: PrometheusRangeData,
    counterName: string,
): number[] {
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

    if (
        values.some(
            (value) => !Number.isFinite(value) || value < 0,
        )
    ) {
        throw new MetricSummaryUnavailableError(
            `Invalid numeric sample for ${counterName}`,
        );
    }

    return values;
}

function getCounterDelta(
    data: PrometheusRangeData,
    counterName: string,
): number {
    const values = getSingleCounterValues(data, counterName);

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

function getCounterIncrease(
    data: PrometheusRangeData,
    counterName: string,
): number {
    const values = getSingleCounterValues(data, counterName);
    let increase = 0;

    for (let index = 1; index < values.length; index += 1) {
        const previous = values[index - 1];
        const current = values[index];

        if (previous === undefined || current === undefined) {
            throw new MetricSummaryUnavailableError(
                `Not enough samples for ${counterName}`,
            );
        }

        if (current >= previous) {
            increase += current - previous;
        } else {
            // A process/container recreate resets the application counter.
            // Treat the current value as growth since the reset instead of
            // discarding the window or calculating a negative delta.
            increase += current;
        }
    }

    return increase;
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

    return buildWindowSummary(start, end, sumDelta, countDelta);
}

function buildWindowSummary(
    start: number,
    end: number,
    sumIncrease: number,
    countIncrease: number,
): MetricWindowSummary {
    if (countIncrease <= 0) {
        throw new MetricSummaryUnavailableError(
            "No requests occurred in the metric window",
        );
    }

    const averageLatency = sumIncrease / countIncrease;

    if (!Number.isFinite(averageLatency) || averageLatency < 0) {
        throw new MetricSummaryUnavailableError(
            "Unable to calculate average latency",
        );
    }

    return {
        start,
        end,
        averageLatency,
        requestCount: countIncrease,
    };
}

function escapePrometheusLabelValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/"/g, '\\"');
}

function buildJobScopedLatencyQuery(
    prometheusJob: string,
    suffix: "sum" | "count",
): string {
    const job = escapePrometheusLabelValue(prometheusJob);
    const metricMatcher =
        `.*_http_request_duration_seconds_${suffix}`;

    return `sum({job="${job}",__name__=~"${metricMatcher}"})`;
}

async function calculateJobScopedWindow(
    start: number,
    end: number,
    prometheusJob: string,
): Promise<MetricWindowSummary> {
    const sumQuery = buildJobScopedLatencyQuery(prometheusJob, "sum");
    const countQuery = buildJobScopedLatencyQuery(prometheusJob, "count");

    const [sumData, countData] = await Promise.all([
        queryPrometheusRange({
            query: sumQuery,
            start: String(start),
            end: String(end),
            step: JOB_SCOPED_QUERY_STEP,
        }),
        queryPrometheusRange({
            query: countQuery,
            start: String(start),
            end: String(end),
            step: JOB_SCOPED_QUERY_STEP,
        }),
    ]);

    const sumIncrease = getCounterIncrease(
        sumData,
        `${prometheusJob} HTTP latency sum`,
    );

    const countIncrease = getCounterIncrease(
        countData,
        `${prometheusJob} HTTP latency count`,
    );

    return buildWindowSummary(
        start,
        end,
        sumIncrease,
        countIncrease,
    );
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

export async function getJobScopedHttpLatencyMetricSummary(
    incidentAt: number,
    windowSeconds: number,
    prometheusJob: string,
): Promise<HttpLatencyMetricSummary> {
    const beforeStart = incidentAt - windowSeconds;
    const beforeEnd = incidentAt;

    const afterStart = incidentAt;
    const afterEnd = incidentAt + windowSeconds;

    const [before, after] = await Promise.all([
        calculateJobScopedWindow(
            beforeStart,
            beforeEnd,
            prometheusJob,
        ),
        calculateJobScopedWindow(
            afterStart,
            afterEnd,
            prometheusJob,
        ),
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
