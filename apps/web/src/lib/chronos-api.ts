const CHRONOS_API_URL = (
  process.env.CHRONOS_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

export type IncidentDetail = {
  id: string;
  serviceId: string;
  serviceName: string;
  prometheusJob: string | null;
  title: string;
  status: "open" | "resolved";
  startedAt: string;
  resolvedAt: string | null;
  triggerType: string;
};

export type ServiceSummary = {
  id: string;
  name: string;
  description: string | null;
  prometheusJob: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IncidentSummary = IncidentDetail;

type RawEventSummary = {
  id: string;
  service_id: string;
  source: string;
  type: string;
  title: string;
  occurred_at: string;
};

export type EventSummary = {
  id: string;
  serviceId: string;
  source: string;
  type: string;
  title: string;
  occurredAt: string;
};

type CorrelationEvent = {
  id: string;
  service_id: string;
  source: string;
  type: string;
  title: string;
  occurred_at: string;
};

export type CorrelatedEvent = {
  event: CorrelationEvent;
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

export class ChronosApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChronosApiError";
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${CHRONOS_API_URL}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new ChronosApiError(
      `Chronos API request failed with ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function getServices(): Promise<ServiceSummary[]> {
  return fetchJson<ServiceSummary[]>("/services");
}

export function getIncidents(): Promise<IncidentSummary[]> {
  return fetchJson<IncidentSummary[]>("/incidents");
}

export async function getEvents(): Promise<EventSummary[]> {
  const events = await fetchJson<RawEventSummary[]>("/events");

  return events.map((event) => ({
    id: event.id,
    serviceId: event.service_id,
    source: event.source,
    type: event.type,
    title: event.title,
    occurredAt: event.occurred_at,
  }));
}

export async function getIncidentDetail(
  incidentId: string,
): Promise<IncidentDetail | null> {
  const response = await fetch(
    `${CHRONOS_API_URL}/incidents/${encodeURIComponent(incidentId)}`,
    { cache: "no-store" },
  );

  if (response.status === 400 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ChronosApiError(
      `Unable to load incident (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as IncidentDetail;
}

export function getIncidentCorrelation(
  incidentId: string,
): Promise<IncidentCorrelation> {
  return fetchJson<IncidentCorrelation>(
    `/incidents/${encodeURIComponent(incidentId)}/correlation`,
  );
}

export async function getMetricSummary(
  incidentAt: number,
  windowSeconds: number,
): Promise<HttpLatencyMetricSummary | null> {
  const params = new URLSearchParams({
    incidentAt: String(incidentAt),
    windowSeconds: String(windowSeconds),
  });

  const response = await fetch(
    `${CHRONOS_API_URL}/metrics/summary?${params.toString()}`,
    { cache: "no-store" },
  );

  if (response.status === 422) {
    return null;
  }

  if (!response.ok) {
    throw new ChronosApiError(
      `Unable to load metric summary (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as HttpLatencyMetricSummary;
}

export async function getIncidentMetricSummary(
  incidentId: string,
  windowSeconds: number,
): Promise<HttpLatencyMetricSummary | null> {
  const params = new URLSearchParams({
    windowSeconds: String(windowSeconds),
  });

  const response = await fetch(
    `${CHRONOS_API_URL}/incidents/${encodeURIComponent(incidentId)}/metric-summary?${params.toString()}`,
    { cache: "no-store" },
  );

  if (response.status === 422) {
    return null;
  }

  if (!response.ok) {
    throw new ChronosApiError(
      `Unable to load incident metric summary (${response.status})`,
      response.status,
    );
  }

  return (await response.json()) as HttpLatencyMetricSummary;
}
