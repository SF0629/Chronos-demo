export type Locale = "en" | "ko";

export type ProductMessages = {
  product: {
    incidentInvestigation: string;
    dashboard: string;
    incidents: string;
    services: string;
    light: string;
    dark: string;
    switchToLight: string;
    switchToDark: string;
    productNavigation: string;
    preferences: string;
  };
  common: {
    status: string;
    open: string;
    resolved: string;
    manual: string;
    unknown: string;
    ongoing: string;
    view: string;
    viewIncident: string;
    allIncidents: string;
    started: string;
    resolvedLabel: string;
    duration: string;
    trigger: string;
    service: string;
    updated: string;
    prometheusJob: string;
  };
  dashboard: {
    title: string;
    description: string;
    overview: string;
    openIncidents: string;
    needsInvestigation: string;
    registeredWorkloads: string;
    needsAttention: string;
    needsAttentionDescription: string;
    noOpenIncidents: string;
    noOpenIncidentsDescription: string;
    recentIncidents: string;
    recentIncidentsDescription: string;
    noIncidents: string;
    recentChanges: string;
    recentChangesDescription: string;
    noEvents: string;
  };
  incidents: {
    title: string;
    description: string;
    queue: string;
    incident: string;
    noIncidents: string;
    noIncidentsDescription: string;
  };
  services: {
    title: string;
    description: string;
    registered: string;
    noDescription: string;
    notConfigured: string;
    noServices: string;
    noServicesDescription: string;
  };
  incident: {
    analysis: string;
    backToIncidents: string;
    manualIncident: string;
    summary: string;
    relatedChanges: string;
    metricSummary: string;
    timeline: string;
    changesShort: string;
    metricsShort: string;
    onThisIncident: string;
    incidentSections: string;
    contextNavigation: string;
    sectionsNavigation: string;
    relatedDescription: string;
    metricDescription: string;
    timelineDescription: string;
    unableRelated: string;
    noRelated: string;
    relevantEvents: string;
    relevanceDisclaimer: string;
    relevance: string;
    beforeIncident: string;
    afterIncident: string;
    metricUnavailable: string;
    observedMetric: string;
    averageHttpLatency: string;
    before: string;
    after: string;
    observedChange: string;
    observedRequests: string;
    increase: string;
    decrease: string;
    unchanged: string;
    higher: string;
    lower: string;
    latencyIncreased: string;
    latencyDecreased: string;
    latencyUnchanged: string;
    unableTimeline: string;
    noTimeline: string;
    incidentStarted: string;
    loading: string;
    notFound: string;
    notFoundDescription: string;
  };
};

const en: ProductMessages = {
  product: {
    incidentInvestigation: "Incident investigation",
    dashboard: "Dashboard",
    incidents: "Incidents",
    services: "Services",
    light: "Light",
    dark: "Dark",
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
    productNavigation: "Product navigation",
    preferences: "Product preferences",
  },
  common: {
    status: "Status",
    open: "OPEN",
    resolved: "RESOLVED",
    manual: "Manual",
    unknown: "Unknown",
    ongoing: "Ongoing",
    view: "View",
    viewIncident: "View incident →",
    allIncidents: "All incidents →",
    started: "Started",
    resolvedLabel: "Resolved",
    duration: "Duration",
    trigger: "Trigger",
    service: "Service",
    updated: "Updated",
    prometheusJob: "Prometheus job",
  },
  dashboard: {
    title: "Dashboard",
    description: "Overview of incidents and recent changes across your services.",
    overview: "Overview",
    openIncidents: "Open incidents",
    needsInvestigation: "Needs investigation",
    registeredWorkloads: "Registered workloads",
    needsAttention: "Needs Attention",
    needsAttentionDescription: "Open incidents ready for investigation.",
    noOpenIncidents: "No open incidents.",
    noOpenIncidentsDescription: "New manual incidents will appear here when opened.",
    recentIncidents: "Recent Incidents",
    recentIncidentsDescription: "Most recently started incidents.",
    noIncidents: "No incidents recorded yet.",
    recentChanges: "Recent Changes",
    recentChangesDescription: "Latest persisted GitHub and Docker events.",
    noEvents: "No events recorded yet.",
  },
  incidents: {
    title: "Incidents",
    description: "Open and resolved incidents across registered services.",
    queue: "Incident queue",
    incident: "Incident",
    noIncidents: "No incidents recorded yet.",
    noIncidentsDescription: "Manual incidents will appear here after they are created.",
  },
  services: {
    title: "Services",
    description: "Registered services available for incident correlation.",
    registered: "Registered services",
    noDescription: "No description provided.",
    notConfigured: "Not configured",
    noServices: "No services registered yet.",
    noServicesDescription: "Services created through the Chronos API will appear here.",
  },
  incident: {
    analysis: "Incident analysis",
    backToIncidents: "← All incidents",
    manualIncident: "Manual incident",
    summary: "Summary",
    relatedChanges: "Related Changes",
    metricSummary: "Metric Summary",
    timeline: "Timeline",
    changesShort: "Changes",
    metricsShort: "Metrics",
    onThisIncident: "On this incident",
    incidentSections: "Incident sections:",
    contextNavigation: "Incident context navigation",
    sectionsNavigation: "Incident sections",
    relatedDescription: "Events ranked by relevance around the incident boundary.",
    metricDescription: "Observed HTTP latency before and after the incident boundary.",
    timelineDescription: "Chronological event context with the incident boundary marked in place.",
    unableRelated: "Unable to load related changes.",
    noRelated: "No related changes found in the incident window.",
    relevantEvents: "Potentially relevant events around the incident boundary",
    relevanceDisclaimer: "Relevance score, not root cause probability.",
    relevance: "Relevance",
    beforeIncident: "before incident",
    afterIncident: "after incident",
    metricUnavailable: "Metric summary is unavailable for this incident window.",
    observedMetric: "Observed metric",
    averageHttpLatency: "Average HTTP Latency",
    before: "Before",
    after: "After",
    observedChange: "Observed change",
    observedRequests: "observed requests",
    increase: "Increase",
    decrease: "Decrease",
    unchanged: "Unchanged",
    higher: "higher",
    lower: "lower",
    latencyIncreased: "Latency increased after the incident boundary.",
    latencyDecreased: "Latency decreased after the incident boundary.",
    latencyUnchanged: "Latency was unchanged across the incident boundary.",
    unableTimeline: "Unable to load incident timeline.",
    noTimeline: "No events found in the incident window.",
    incidentStarted: "Incident started",
    loading: "Loading incident…",
    notFound: "Incident not found",
    notFoundDescription: "The requested incident does not exist.",
  },
};

const ko: ProductMessages = {
  product: {
    incidentInvestigation: "Incident investigation",
    dashboard: "Dashboard",
    incidents: "Incidents",
    services: "Services",
    light: "Light",
    dark: "Dark",
    switchToLight: "Light theme으로 전환",
    switchToDark: "Dark theme으로 전환",
    productNavigation: "Product navigation",
    preferences: "Product preferences",
  },
  common: {
    status: "Status",
    open: "OPEN",
    resolved: "RESOLVED",
    manual: "Manual",
    unknown: "Unknown",
    ongoing: "진행 중",
    view: "보기",
    viewIncident: "Incident 보기 →",
    allIncidents: "모든 Incident →",
    started: "Started",
    resolvedLabel: "Resolved",
    duration: "Duration",
    trigger: "Trigger",
    service: "Service",
    updated: "Updated",
    prometheusJob: "Prometheus job",
  },
  dashboard: {
    title: "Dashboard",
    description: "서비스 전반의 Incident와 최근 변경 사항을 확인합니다.",
    overview: "Overview",
    openIncidents: "Open Incidents",
    needsInvestigation: "확인이 필요한 Incident",
    registeredWorkloads: "등록된 Service",
    needsAttention: "확인 필요",
    needsAttentionDescription: "현재 확인이 필요한 Open Incident입니다.",
    noOpenIncidents: "현재 확인이 필요한 Open Incident가 없습니다.",
    noOpenIncidentsDescription: "새 Manual Incident가 열리면 여기에 표시됩니다.",
    recentIncidents: "최근 Incident",
    recentIncidentsDescription: "최근 시작된 Incident입니다.",
    noIncidents: "아직 기록된 Incident가 없습니다.",
    recentChanges: "최근 변경 사항",
    recentChangesDescription: "최근 저장된 GitHub / Docker Event입니다.",
    noEvents: "최근 수집된 Event가 없습니다.",
  },
  incidents: {
    title: "Incidents",
    description: "등록된 Service의 Open / Resolved Incident를 확인합니다.",
    queue: "Incident queue",
    incident: "Incident",
    noIncidents: "아직 기록된 Incident가 없습니다.",
    noIncidentsDescription: "Manual Incident가 생성되면 여기에 표시됩니다.",
  },
  services: {
    title: "Services",
    description: "Incident 분석 대상 Service를 확인합니다.",
    registered: "등록된 Service",
    noDescription: "설명 없음",
    notConfigured: "Not configured",
    noServices: "등록된 Service가 없습니다.",
    noServicesDescription: "Chronos API로 생성한 Service가 여기에 표시됩니다.",
  },
  incident: {
    analysis: "Incident analysis",
    backToIncidents: "← 모든 Incident",
    manualIncident: "Manual Incident",
    summary: "Summary",
    relatedChanges: "Related Changes",
    metricSummary: "Metric Summary",
    timeline: "Timeline",
    changesShort: "Changes",
    metricsShort: "Metrics",
    onThisIncident: "이 Incident",
    incidentSections: "이 Incident:",
    contextNavigation: "Incident 내부 탐색",
    sectionsNavigation: "Incident sections",
    relatedDescription: "Incident 전후에 발생한 관련 가능성이 있는 Event입니다.",
    metricDescription: "Incident 전후에 관측된 HTTP Latency를 비교합니다.",
    timelineDescription: "Incident 경계를 포함한 Event 흐름을 시간순으로 표시합니다.",
    unableRelated: "Related Changes를 불러올 수 없습니다.",
    noRelated: "Incident 범위에서 관련 Event를 찾지 못했습니다.",
    relevantEvents: "Incident 전후의 관련 Event",
    relevanceDisclaimer: "Relevance 점수는 관련성을 나타내며, Root Cause일 확률을 의미하지 않습니다.",
    relevance: "Relevance",
    beforeIncident: "Incident 전",
    afterIncident: "Incident 후",
    metricUnavailable: "이 Incident 구간의 Metric Summary를 사용할 수 없습니다.",
    observedMetric: "Observed metric",
    averageHttpLatency: "Average HTTP Latency",
    before: "Before",
    after: "After",
    observedChange: "Observed change",
    observedRequests: "requests",
    increase: "Increase",
    decrease: "Decrease",
    unchanged: "Unchanged",
    higher: "higher",
    lower: "lower",
    latencyIncreased: "Incident 경계 이후 Latency가 증가했습니다.",
    latencyDecreased: "Incident 경계 이후 Latency가 감소했습니다.",
    latencyUnchanged: "Incident 경계 전후의 Latency 변화가 없습니다.",
    unableTimeline: "Timeline을 불러올 수 없습니다.",
    noTimeline: "Incident 범위에서 Event를 찾지 못했습니다.",
    incidentStarted: "Incident 시작",
    loading: "Incident를 불러오는 중…",
    notFound: "Incident를 찾을 수 없습니다",
    notFoundDescription: "요청한 Incident가 존재하지 않습니다.",
  },
};

export function getMessages(locale: Locale): ProductMessages {
  return locale === "ko" ? ko : en;
}
