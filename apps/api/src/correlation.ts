import { pool } from "./db.js";

const SUPPORTED_EVENT_TYPES = [
    "github.push",
    "docker.container.restart",
    "docker.container.die",
    "docker.container.stop",
    "docker.container.start",
] as const;

type SupportedEventType = (typeof SUPPORTED_EVENT_TYPES)[number];

const TYPE_WEIGHT_UNITS: Readonly<Record<SupportedEventType, number>> = {
    "github.push": 100,
    "docker.container.restart": 95,
    "docker.container.die": 90,
    "docker.container.stop": 85,
    "docker.container.start": 75,
};

const BEFORE_WINDOW_MS = 15 * 60 * 1000;
const AFTER_WINDOW_MS = 5 * 60 * 1000;

type IncidentRow = {
    id: string;
    service_id: string;
    started_at: Date;
};

type EventRow = Record<string, unknown> & {
    id: string;
    service_id: string;
    type: string;
    occurred_at: Date;
};

export type CorrelatedEvent = {
    event: EventRow;
    score: number;
    deltaSeconds: number;
    position: "before" | "after";
};

export type IncidentCorrelation = {
    incidentId: string;
    startedAt: string;
    window: {
        start: string;
        end: string;
    };
    relatedEvents: CorrelatedEvent[];
    timeline: CorrelatedEvent[];
};

type TimeWeightResult = {
    weightUnits: number;
    deltaSeconds: number;
    position: "before" | "after";
};

function getTypeWeightUnits(eventType: string): number | null {
    if (!SUPPORTED_EVENT_TYPES.includes(eventType as SupportedEventType)) {
        return null;
    }

    return TYPE_WEIGHT_UNITS[eventType as SupportedEventType];
}

export function getTimeWeight(
    incidentStartedAt: Date,
    eventOccurredAt: Date,
): TimeWeightResult | null {
    const incidentTime = incidentStartedAt.getTime();
    const eventTime = eventOccurredAt.getTime();
    const deltaSeconds = Math.abs(eventTime - incidentTime) / 1000;

    if (eventTime <= incidentTime) {
        if (deltaSeconds <= 60) {
            return { weightUnits: 100, deltaSeconds, position: "before" };
        }

        if (deltaSeconds <= 300) {
            return { weightUnits: 80, deltaSeconds, position: "before" };
        }

        if (deltaSeconds <= 900) {
            return { weightUnits: 50, deltaSeconds, position: "before" };
        }

        return null;
    }

    if (deltaSeconds <= 60) {
        return { weightUnits: 60, deltaSeconds, position: "after" };
    }

    if (deltaSeconds <= 300) {
        return { weightUnits: 30, deltaSeconds, position: "after" };
    }

    return null;
}

export function scoreEvent(
    incidentServiceId: string,
    incidentStartedAt: Date,
    event: EventRow,
): CorrelatedEvent | null {
    if (event.service_id !== incidentServiceId) {
        return null;
    }

    const typeWeightUnits = getTypeWeightUnits(event.type);

    if (typeWeightUnits === null) {
        return null;
    }

    const time = getTimeWeight(incidentStartedAt, event.occurred_at);

    if (!time) {
        return null;
    }

    return {
        event,
        score: (time.weightUnits * typeWeightUnits) / 10_000,
        deltaSeconds: time.deltaSeconds,
        position: time.position,
    };
}

function compareIdsAscending(left: string, right: string): number {
    if (left < right) {
        return -1;
    }

    if (left > right) {
        return 1;
    }

    return 0;
}

export function compareRelatedEvents(
    left: CorrelatedEvent,
    right: CorrelatedEvent,
): number {
    if (left.score !== right.score) {
        return right.score - left.score;
    }

    if (left.deltaSeconds !== right.deltaSeconds) {
        return left.deltaSeconds - right.deltaSeconds;
    }

    const occurredAtDifference =
        right.event.occurred_at.getTime() - left.event.occurred_at.getTime();

    if (occurredAtDifference !== 0) {
        return occurredAtDifference;
    }

    return compareIdsAscending(left.event.id, right.event.id);
}

export function compareTimelineEvents(
    left: CorrelatedEvent,
    right: CorrelatedEvent,
): number {
    const occurredAtDifference =
        left.event.occurred_at.getTime() - right.event.occurred_at.getTime();

    if (occurredAtDifference !== 0) {
        return occurredAtDifference;
    }

    return compareIdsAscending(left.event.id, right.event.id);
}

export async function getIncidentCorrelation(
    incidentId: string,
): Promise<IncidentCorrelation | null> {
    const incidentResult = await pool.query(
        `SELECT id, service_id, started_at
         FROM incidents
         WHERE id = $1;`,
        [incidentId],
    );

    const incident = incidentResult.rows[0] as IncidentRow | undefined;

    if (!incident) {
        return null;
    }

    const startedAt = incident.started_at;
    const windowStart = new Date(startedAt.getTime() - BEFORE_WINDOW_MS);
    const windowEnd = new Date(startedAt.getTime() + AFTER_WINDOW_MS);

    const eventResult = await pool.query(
        `SELECT *
         FROM events
         WHERE service_id = $1
           AND occurred_at >= $2
           AND occurred_at <= $3
           AND type = ANY($4::varchar[]);`,
        [incident.service_id, windowStart, windowEnd, SUPPORTED_EVENT_TYPES],
    );

    const correlatedEvents = (eventResult.rows as EventRow[])
        .map((event) => scoreEvent(incident.service_id, startedAt, event))
        .filter((event): event is CorrelatedEvent => event !== null);

    return {
        incidentId: incident.id,
        startedAt: startedAt.toISOString(),
        window: {
            start: windowStart.toISOString(),
            end: windowEnd.toISOString(),
        },
        relatedEvents: [...correlatedEvents].sort(compareRelatedEvents),
        timeline: [...correlatedEvents].sort(compareTimelineEvents),
    };
}
