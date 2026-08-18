# Chronos v0.1 UI Wireframe

이 문서는 WBS 6.1에서 Chronos v0.1의 세 핵심 화면에 대한 information architecture와 low-fidelity wireframe을 정의한다.

대상 화면:

1. Dashboard
2. Service Detail
3. Incident Detail

이번 문서는 구현 명세가 아니다. 실제 Next.js route, React component, API fetch, styling, responsive implementation은 이후 명시적으로 할당되는 UI 구현 WBS에서 별도 검토를 거쳐 진행한다.

---

## Product UI Principle

Chronos UI는 실시간 monitoring dashboard가 아니라 **Incident 조사 흐름**을 중심으로 한다.

핵심 제품 질문:

> What changed right before it broke?

화면은 다음 원칙을 유지한다.

- Dashboard는 조사할 Service와 Incident를 빠르게 찾는 시작점이다.
- Service Detail은 하나의 Service 안에서 Incident와 Event context를 모아 본다.
- Incident Detail은 장애 직전 변화, 전후 metric, 전체 시간 흐름을 한 화면에서 설명한다.
- Chronos는 root cause를 확정하지 않는다.
- `Related Changes` / `Potentially Relevant Events` 표현을 사용하고 `Root Cause`, `Cause`, `Caused by ...` 표현은 사용하지 않는다.
- correlation score는 relevance score이며 root cause probability로 표시하지 않는다.
- Related Changes는 relevance 중심, Timeline은 chronology 중심이라는 D-011 separation을 유지한다.
- Grafana/Uptime Kuma를 대체하는 chart wall, health dashboard, alert management UI를 만들지 않는다.
- v0.1은 desktop-first이며 읽기 쉬운 content-first single-column 흐름을 기본으로 한다.
- 작은 화면에서는 section을 한 열로 stack하고 핵심 텍스트가 잘리지 않는 수준까지만 정의한다.

---

## Navigation

v0.1 navigation은 세 화면의 이동 관계만 정의한다.
복잡한 sidebar, settings navigation, integration navigation은 만들지 않는다.

```text
Chronos
│
├─ Dashboard                         /
│   ├─ Incident row/card ──────────→ /incidents/:id
│   └─ Service row/card ───────────→ /services/:id
│
├─ Service Detail                    /services/:id
│   ├─ Dashboard ──────────────────→ /
│   └─ Incident row ───────────────→ /incidents/:id
│
└─ Incident Detail                   /incidents/:id
    ├─ Dashboard ──────────────────→ /
    └─ Service ────────────────────→ /services/:id
```

이번 WBS에서는 위 route를 실제로 생성하지 않는다.

---

## Dashboard

### Goal

사용자가 Chronos에 들어온 직후 다음 질문에 답할 수 있어야 한다.

> 지금 어떤 Service와 Incident를 봐야 하는가?

Dashboard는 monitoring 상태를 계속 감시하는 화면이 아니라 **조사 대상을 선택하는 시작 화면**이다.

### Information hierarchy

우선순위는 다음과 같다.

1. Header
2. Open / Recent Incidents
3. Services
4. Recent Changes

#### 1. Header

최소 정보:

- `Chronos`
- 현재 위치 `Dashboard`

v0.1에서는 복잡한 global navigation을 추가하지 않는다.

#### 2. Open / Recent Incidents

Dashboard의 가장 중요한 section이다.

각 Incident item 최소 정보:

- Incident title
- Service name
- status
- started time
- resolved time 또는 `Ongoing`

item 선택 시 Incident Detail로 이동한다.

정렬 정책 자체는 이번 wireframe에서 새로 정의하지 않는다. 필요한 list API contract와 함께 해당 화면 구현 WBS에서 Supervisor가 결정한다.

#### 3. Services

각 Service item 최소 정보:

- Service name
- description 또는 짧은 identifier
- open Incident 존재 여부
- 최근 activity를 제공할 수 있다면 마지막 Event 시간

Service 자체 health state는 현재 도메인에 존재하지 않으므로 근거 없는 `UP` / `DOWN` badge를 만들지 않는다.

item 선택 시 Service Detail로 이동한다.

#### 4. Recent Changes

최근 Chronos Event를 짧게 보여주는 보조 section이다.

각 Event item 최소 정보:

- source
- type
- title
- Service
- occurred time

목적은 다음 질문에 빠르게 답하는 것이다.

> 최근 시스템에서 어떤 변화가 있었나?

### ASCII wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Chronos                                      Dashboard        │
├──────────────────────────────────────────────────────────────┤
│ Open / Recent Incidents                                      │
│                                                              │
│ [OPEN]     API latency spike                                 │
│            Demo API · Started 8 min ago · Ongoing            │
│                                                        →     │
│ [RESOLVED] Worker restart loop                               │
│            Worker · Started 42 min ago · Resolved 31 min ago │
│                                                        →     │
├──────────────────────────────────────────────────────────────┤
│ Services                                                     │
│                                                              │
│ Demo API                                                     │
│ Public API service · 1 open incident · Last event 2 min ago →│
│                                                              │
│ Worker                                                       │
│ Background worker · No open incident · Last event 31 min ago→│
├──────────────────────────────────────────────────────────────┤
│ Recent Changes                                               │
│                                                              │
│ 00:03  GitHub  push     Demo API  deployed revision abc123   │
│ 00:01  Docker  restart  Worker    container restarted        │
│ 23:58  Docker  start    Demo API  container started          │
└──────────────────────────────────────────────────────────────┘
```

### States

API-backed section은 각각 loading / success / empty / error 상태를 고려한다.

대표 empty state:

- Open / Recent Incidents: `No recent incidents.`
- Services: `No services available.`
- Recent Changes: `No recent changes.`

Loading은 section skeleton 또는 간단한 loading 표시로 충분하며 이번 WBS에서 component 형태를 정하지 않는다.
Error는 해당 section의 데이터를 불러오지 못했음을 명확히 표시하되 다른 section까지 숨기지 않는 방향을 우선한다.

### Not in Dashboard

- monitoring chart wall
- CPU / memory 전체 overview
- alert management
- notification center
- root cause 표시
- AI analysis
- 근거 없는 Service health badge

---

## Service Detail

### Goal

하나의 Service를 기준으로 다음 질문에 답할 수 있어야 한다.

> 이 서비스에서 최근 어떤 변화와 Incident가 있었는가?

### Information hierarchy

우선순위는 다음과 같다.

1. Service Header
2. Incidents
3. Recent Events
4. Source Context

#### 1. Service Header

최소 정보:

- Service name
- description
- Prometheus job 또는 현재 제공 가능한 연결 식별 정보가 있다면 보조 정보

현재 Service health state가 구현되어 있지 않으므로 `UP` / `DOWN` 상태를 추론하지 않는다.

#### 2. Incidents

해당 Service의 Incident context를 보여준다.

각 Incident item 최소 정보:

- title
- status
- started_at
- resolved_at 또는 `Ongoing`

item 선택 시 Incident Detail로 이동한다.

#### 3. Recent Events

해당 Service의 최근 Event를 시간 중심으로 보여준다.

각 Event item 최소 정보:

- source
- type
- title
- occurred_at

이 영역은 correlation ranking이 아니라 Service activity context다.

#### 4. Source Context

필요한 경우 작은 보조 영역으로 이 Service를 관측하는 데이터 출처를 설명한다.

예상 표시 범주:

- Docker
- GitHub
- Prometheus

이는 integration management UI가 아니다.
credential, OAuth, configuration 변경 기능은 제공하지 않는다.

### ASCII wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Chronos  /  Dashboard  /  Service                           │
├──────────────────────────────────────────────────────────────┤
│ Demo API                                                     │
│ Public API service                                           │
│ Prometheus job: chronos-api                                  │
├──────────────────────────────────────────────────────────────┤
│ Incidents                                                    │
│                                                              │
│ [OPEN]     API latency spike                                 │
│            Started 00:00 · Ongoing                      →    │
│                                                              │
│ [RESOLVED] Deployment failure                                │
│            Started yesterday 21:14 · Resolved 21:22     →    │
├──────────────────────────────────────────────────────────────┤
│ Recent Events                                                │
│                                                              │
│ 00:03  GitHub  push      deployed revision abc123            │
│ 00:01  Docker  restart   container restarted                 │
│ 23:58  Docker  start     container started                   │
├──────────────────────────────────────────────────────────────┤
│ Source Context                                               │
│ Docker · GitHub · Prometheus                                 │
└──────────────────────────────────────────────────────────────┘
```

### States

대표 empty state:

- Incidents: `No incidents for this service.`
- Recent Events: `No recent events for this service.`
- Source Context: source 정보가 제공되지 않으면 section을 비우거나 `No source context available.` 수준으로 표현

Service 자체를 찾지 못한 경우와 section별 fetch error는 구현 단계에서 API contract에 맞춰 구분한다.

### Not in Service Detail

- Service 설정 관리
- GitHub OAuth
- Docker configuration
- alert policy
- generic integration marketplace
- full monitoring dashboard
- 추론된 health state

---

## Incident Detail

### Goal

Chronos의 핵심 화면이다.

사용자가 한눈에 다음 질문에 답할 수 있어야 한다.

> 이 장애 직전에 무엇이 바뀌었고, metric은 어떻게 달라졌는가?

화면의 narrative는 다음 순서를 따른다.

```text
Incident 발생
↓
직전에 관련성 높은 어떤 변경이 있었음
↓
metric이 Incident 전후로 어떻게 달라졌음
↓
전체 Event 시간 흐름이 어떠했음
```

### Information hierarchy

순서는 고정한다.

1. Incident Summary
2. Related Changes
3. Metric Summary
4. Timeline

#### 1. Incident Summary

화면 최상단에 최소 다음을 표시한다.

- Incident title
- Service
- status
- started_at
- resolved_at
- resolved Incident라면 계산 가능한 duration

여기에서 root cause를 표시하지 않는다.

#### 2. Related Changes

Incident Detail에서 가장 중요한 분석 section이다.
현재 `GET /incidents/:id/correlation`의 `relatedEvents` ordering을 그대로 표현한다.

각 item 최소 정보:

- source
- event type
- title
- occurred time
- Incident 기준 `before` / `after`
- relevance score

score는 다음처럼 표현한다.

```text
Relevance 76/100
```

사용하지 않는 표현:

```text
76% probability
76% chance of being the cause
Root Cause
Caused by GitHub push
```

필요하면 보조 설명을 제공한다.

```text
Relevance score, not root cause probability.
```

UI에서 API 결과를 다시 별도 방식으로 ranking하지 않는다.

#### 3. Metric Summary

Related Changes 바로 다음에 둔다.
현재 `GET /metrics/summary`가 제공하는 HTTP latency before/after summary를 중심으로 한다.

최소 정보:

- metric 이름
- before 값
- after 값
- 변화 방향 또는 delta

예:

```text
Average HTTP Latency
Before 120 ms  →  After 410 ms
Change +290 ms
```

관측 표현은 가능하다.

```text
Latency increased after the incident boundary.
```

원인 표현은 금지한다.

```text
Latency caused the incident.
```

#### 4. Timeline

화면 하단에서 현재 correlation API의 `timeline`을 chronological order 그대로 표현한다.

각 item 최소 정보:

- timestamp
- source
- type
- title

Incident `started_at` 위치를 Event 사이에 명확한 boundary marker로 표시한다.
Timeline에서는 relevance score를 주요 정보로 강조하지 않는다.

### ASCII wireframe

```text
┌──────────────────────────────────────────────────────────────┐
│ Chronos  /  Dashboard  /  Demo API  /  Incident             │
├──────────────────────────────────────────────────────────────┤
│ API latency spike                                            │
│ Demo API · RESOLVED                                          │
│ Started 00:00 · Resolved 00:12 · Duration 12 min            │
├──────────────────────────────────────────────────────────────┤
│ Related Changes                                              │
│ Relevance score, not root cause probability.                 │
│                                                              │
│ [GitHub] push                              Relevance 100/100  │
│ deployed revision abc123 · 30 sec before                     │
│                                                              │
│ [Docker] restart                           Relevance 76/100   │
│ container restarted · 3 min before                           │
│                                                              │
│ [Docker] die                               Relevance 54/100   │
│ container exited · 30 sec after                              │
├──────────────────────────────────────────────────────────────┤
│ Metric Summary                                               │
│                                                              │
│ Average HTTP Latency                                         │
│ Before 120 ms  ─────────────→  After 410 ms                  │
│ Change +290 ms                                               │
│ Latency increased after the incident boundary.               │
├──────────────────────────────────────────────────────────────┤
│ Timeline                                                     │
│                                                              │
│ 23:57  GitHub  push      deployed revision abc123            │
│ 23:59  Docker  restart   container restarted                 │
│ ─────────────── Incident started · 00:00 ──────────────────  │
│ 00:00  Docker  die       container exited                    │
│ 00:01  Docker  start     container started                   │
└──────────────────────────────────────────────────────────────┘
```

### States

대표 empty state:

- Related Changes: `No related changes found in the incident window.`
- Metric Summary: `Metric summary is unavailable for this incident window.`
- Timeline: `No events found in the incident window.`

Section별 loading / error를 독립적으로 표현할 수 있어야 한다.
예를 들어 Metric Summary 조회가 실패해도 Incident Summary와 Related Changes를 볼 수 있는 구조를 우선한다.

Incident 자체를 찾지 못한 경우는 section empty가 아니라 Incident-level not-found 상태로 구분한다.

### Role separation

```text
Related Changes
→ relevance 중심
→ API의 relatedEvents ordering 유지
→ score를 명확히 표시

Metric Summary
→ Incident 전후 관측값 비교
→ 원인 단정 금지

Timeline
→ chronology 중심
→ oldest → newest
→ Incident started boundary 표시
```

---

## Data / API Mapping

현재 구현된 API와 wireframe 데이터 요구를 다음처럼 연결한다.
API가 없는 항목은 이번 WBS에서 구현하지 않고 data requirement로만 기록한다.

| 화면 / 영역 | 필요한 데이터 | 현재 API | 상태 / 주의점 |
|---|---|---|---|
| Dashboard / Open & Recent Incidents | Incident title, Service, status, started/resolved time | dedicated list API 없음 | future UI data requirement; 구현 WBS에서 contract 결정 |
| Dashboard / Services | Service name, description, open Incident 여부, last Event time | dedicated Service list API 없음 | data requirement만 기록 |
| Dashboard / Recent Changes | recent Event source/type/title/service/time | `GET /events` | Event row는 사용 가능하지만 Service 표시용 데이터 결합 방식은 별도 결정 필요 |
| Service / Header | Service name, description, Prometheus job/context | dedicated Service detail API 없음 | future UI data requirement; 구현 WBS에서 contract 결정 |
| Service / Incidents | 해당 Service의 Incident list | dedicated Service Incident list API 없음 | data requirement만 기록 |
| Service / Recent Events | source/type/title/occurred_at | `GET /services/:id/events` | 현재 API 사용 가능 |
| Service / Source Context | Docker/GitHub/Prometheus source context | 전용 UI/API contract 없음 | generic integration management로 확대하지 않음 |
| Incident / Summary | title, Service, status, started_at, resolved_at | `GET /incidents/:id` 없음 | Incident Detail 구현 전 조회 contract 결정 필요 |
| Incident / Related Changes | event, score, deltaSeconds, position | `GET /incidents/:id/correlation` | API ordering 그대로 사용 |
| Incident / Timeline | chronological correlated Event set | `GET /incidents/:id/correlation` | API `timeline` ordering 그대로 사용 |
| Incident / Metric Summary | before/after HTTP latency | `GET /metrics/summary` | 현재 incident id가 아니라 `incidentAt` + `windowSeconds` 필요 |

현재 존재하는 관련 API:

```text
GET /incidents/:id/correlation
GET /metrics/summary
GET /events
GET /services/:id/events
```

현재 없는 dedicated Incident detail endpoint 때문에 Incident Summary의 title/status/service/resolved_at 전체를 현재 단일 조회로 받을 수 없다.
또한 Metric Summary는 Incident id를 직접 받지 않으므로 Incident `started_at`을 확보하는 integration contract가 필요하다.

---

## Implementation Notes for WBS 6.2

WBS 6.2의 범위는 Incident Detail 화면 골격과 핵심 세 section의 실제 API 데이터 표시다.
이번 문서는 필요한 화면 데이터와 integration gap만 기록하며 API endpoint를 임의로 추가하거나 설계하지 않는다.

WBS 6.2 구현 전에 직접 결정해야 하는 항목:

1. Incident Detail Summary의 title, Service, status, started_at, resolved_at data source
2. `GET /metrics/summary`에 전달할 Incident `started_at` 확보 방식
3. Related Changes와 Timeline은 `GET /incidents/:id/correlation`을 사용하고 각 API ordering을 그대로 유지
4. Incident Summary / Related Changes / Metric Summary / Timeline의 loading / empty / error fetch boundary
5. 존재하지 않는 Incident에 대한 Incident-level not-found 처리

Dashboard / Service Detail의 missing API나 data contract는 WBS 6.2에서 구현하지 않는다.
아래 Future UI Data Requirements로 분리하며, 해당 화면의 실제 구현 WBS에서 Supervisor가 contract를 결정한다.

WBS 6.2 구현 시 유지할 규칙:

- `relatedEvents`는 API relevance ordering을 그대로 사용한다.
- `timeline`은 API chronological ordering을 그대로 사용한다.
- score를 probability로 변환하거나 root cause로 표현하지 않는다.
- Metric 변화는 관측값으로 표현하고 원인으로 단정하지 않는다.
- desktop-first content hierarchy를 유지하고 작은 화면에서는 section을 single-column stack한다.

### Future UI Data Requirements

다음 항목은 이 wireframe이 필요로 하는 향후 data requirement이며 WBS 6.2 scope가 아니다.
이번 WBS에서는 관련 API를 새로 설계하거나 구현하지 않는다.

- Dashboard Incident list data source
- Dashboard Service list data source
- Dashboard Recent Changes에서 `service_id`를 Service name으로 resolve하는 방식
- Service Detail header data source
- Service별 Incident list data source
- Service Source Context data contract

향후 Dashboard / Service Detail 구현 시에도 다음 원칙을 유지한다.

- Service health state를 데이터 없이 추론하지 않는다.
- Dashboard를 monitoring chart wall로 확장하지 않는다.
- generic integration/settings UI를 추가하지 않는다.

WBS 6.1에서는 위 내용을 구현하지 않는다.
