# Chronos Development Context

이 문서는 Chronos의 현재 구현 상태, 확정된 설계 결정, 향후 확장 방향을 기록한다.

새로운 작업을 시작할 때는 추측이나 과거 대화 기억보다
**현재 코드와 이 문서를 우선적인 기준(Source of Truth)으로 사용한다.**

---

## 1. Product

Chronos는 Docker 기반 소규모 서버에서 장애가 발생했을 때
Docker Events, GitHub 변경 기록, Prometheus Metrics 등을
시간축으로 연결하여 장애 직전의 변화를 추적하는
self-hosted incident correlation 플랫폼이다.

Chronos의 핵심 질문은 다음과 같다.

> "서비스가 죽었는가?"가 아니라
> "장애 직전에 무엇이 바뀌었는가?"

Chronos는 root cause를 확정하지 않는다.

대신 장애와 시간적·문맥적으로 관련성이 높은 이벤트를
`Related Changes` 또는 `Potentially Relevant Events`로 제시한다.

---

## 2. v0.1 Scope

현재 v0.1의 핵심 범위:

- Service
- Common Event Model
- Docker Event collection
- GitHub push collection
- Prometheus metric query
- Incident create / resolve
- Incident 주변 Event correlation
- Incident Timeline
- Related Changes
- 기본 Web UI
- Docker Compose self-hosting
- 재현 가능한 E2E incident demo
- README
- 발표 자료

현재 v0.1 범위 밖:

- Authentication
- Kubernetes
- Grafana 대체
- Uptime Kuma 대체
- Log management platform
- AI root cause determination
- Billing / SaaS
- 복잡한 alerting system

Discord 등 notification integration은 이후 확장 가능하다.

---

## 3. Technology Stack

- Node.js 24 LTS
- npm workspaces monorepo
- TypeScript

### Web

- Next.js
- Tailwind CSS

### API

- Express 5
- PostgreSQL 18
- `pg`
- Zod

v0.1에서는 ORM을 사용하지 않는다.

### Agent

- Node.js
- TypeScript
- dockerode

### Infrastructure

- Docker
- Docker Compose
- PostgreSQL
- Prometheus

현재 infra 파일:

```text
infra/
├─ docker-compose.yml
└─ prometheus.yml
```

---

## 4. Repository Architecture

현재 기본 구조:

```text
Chronos-demo/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ agent/
├─ packages/
│  └─ shared/        # 공통 계약이 필요해질 때 사용
├─ infra/
├─ docs/
├─ package.json
└─ package-lock.json
```

`packages/shared`는 공통 타입과 계약을 위한 위치다.

현재 실제 파일이 없다면 Git에는 디렉터리가 나타나지 않을 수 있다.
공통 코드가 필요해지는 시점에 사용한다.

---

## 5. Component Responsibilities

### apps/web

사용자 Web UI.

담당:

- Services
- Incidents
- Timeline
- Related Changes
- Metrics visualization

외부 시스템의 raw event를 직접 해석하지 않는다.

---

### apps/api

Chronos의 중앙 API.

담당:

- Event ingestion
- Event query
- Service 관리
- Incident 관리
- Correlation
- GitHub Webhook 등 server-side integration
- Prometheus query
- Notification integration

PostgreSQL 접근은 API가 담당한다.

---

### apps/agent

`apps/agent`는 Docker 전용 Agent가 아니다.

**Chronos Host Agent**이다.

Chronos 서버가 원격에서 직접 접근하기 어려운
사용자 Host 내부 정보를 수집하고 Chronos API로 전달한다.

현재 Docker가 첫 번째 local source이다.

현재:

```text
Chronos Agent
└─ Docker Collector
```

향후 필요한 경우:

```text
Chronos Agent
├─ Docker Collector
├─ systemd Collector
├─ System Collector
└─ 기타 Host-local Collector
```

처럼 확장할 수 있다.

외부 Source가 하나 추가될 때마다 별도의 Agent application을 만들지 않는다.

---

## 6. Integration Classification

모든 외부 시스템을 같은 방식으로 연결하지 않는다.

각 시스템의 특성에 따라 연결 방향을 결정한다.

### Docker

```text
Docker Engine
↓
Chronos Host Agent
↓
Chronos API
```

Host 내부 접근이 필요하므로 Agent를 사용한다.

### GitHub

```text
GitHub
↓ Webhook
Chronos API
```

GitHub는 Agent를 거치지 않는다.

### Prometheus

Prometheus는 주로 Event Source가 아니라 Metric Store로 취급한다.

WBS 4.1에서 Docker Compose 기반 Prometheus 실행 환경을 추가했다.

WBS 4.2에서 `apps/api`를 현재 application metric producer로 사용한다.

#### Metric exposure / scrape

현재 metric collection 흐름:

```text
HTTP request
→ Chronos API Counter / Histogram 갱신

Prometheus
→ GET Chronos API /metrics
→ raw metric time-series 저장
```

Prometheus가 Chronos API를 pull 방식으로 scrape한다.

현재 metric exposition endpoint:

- `GET /metrics`

metric instrumentation에는 `prom-client`를 사용한다.

현재 Chronos application metrics:

- `chronos_http_requests_total`
  - type: Counter
  - labels: `method`, `status_code`

- `chronos_http_request_duration_seconds`
  - type: Histogram
  - labels: `method`, `status_code`

`/metrics` 요청 자체는 Chronos application HTTP request metric에서 제외한다.

Prometheus가 metric을 측정하기 위해 수행하는 scrape 요청 자체가
application HTTP metric을 계속 증가시키는 것을 방지하기 위함이다.

현재 Prometheus configuration:

- scrape interval: `15s`

scrape jobs:

- `prometheus`
  - target: `localhost:9090`
  - Prometheus self-scrape

- `chronos-api`
  - target: `host.docker.internal:4000`
  - Chronos API `GET /metrics`

`host.docker.internal:4000`은 현재 로컬 개발 환경에서
Docker Desktop의 Prometheus container가
host에서 실행 중인 Chronos API에 접근하기 위한 target이다.

Prometheus UI:

- `http://localhost:9090`

실제 self-scrape target이 UP 상태인 것을 검증했다.
실제 `chronos-api` target도 UP 상태인 것을 검증했다.

기본 PromQL:

- `up`
- `up{job="prometheus"}`
- `up{job="chronos-api"}`
- `chronos_http_requests_total`
- `chronos_http_request_duration_seconds_count`

현재 Prometheus는 자체 metric과
Chronos API application metric을 수집한다.

#### Metric query

WBS 4.3에서 Prometheus HTTP API query integration을 구현했다.

```text
Chronos API
↓ GET /metrics/query-range
Prometheus client
↓ GET /api/v1/query_range
Prometheus
↓ matrix time-series
Chronos API
```

Chronos는 metric이 필요할 때 Prometheus를 query한다.

`query_range`를 15초마다 주기적으로 호출하는 구조가 아니다.
주기적으로 실행되는 것은 Prometheus가 Chronos API의 `/metrics`를 scrape하는 동작이다.

현재 Prometheus client:

- file: `apps/api/src/prometheus.ts`
- env: `PROMETHEUS_URL`
- default: `http://localhost:9090`
- Node.js built-in `fetch`
- range query only

입력:

- `query`
- `start`
- `end`
- `step`

반환 데이터:

- `resultType: matrix`
- `series`
  - metric labels
  - values `[timestamp, value]`

오류 처리:

- invalid/missing client parameter → HTTP 400
- Prometheus bad query → HTTP 400
- Prometheus network/upstream failure → HTTP 502
- invalid upstream response → HTTP 502

Prometheus query 결과와 CPU, memory, HTTP latency 등의 raw metric time-series는
PostgreSQL `events` 테이블에 복제하지 않는다.

Agent는 Prometheus metric collection 또는 query를 담당하지 않는다.

`GET /metrics`는 Prometheus가 Chronos API에서 metric을 pull하는
metric exposition endpoint다.

`GET /metrics/query-range`는 Chronos API가 Prometheus HTTP API에
range query를 보내는 query endpoint다.

scrape 방향과 query 방향을 혼동하지 않는다.

#### Metric summary

WBS 4.4에서 incident 시각 전후의 HTTP average latency를 계산하는
최소 metric summary를 구현했다.

```text
incidentAt ± windowSeconds
        ↓
before / after window 생성
        ↓
queryPrometheusRange()
        ↓
sum(_sum), sum(_count)
        ↓
각 cumulative counter delta 계산
        ↓
before / after average latency 계산
```

before:

```text
[incidentAt - windowSeconds, incidentAt]
```

after:

```text
[incidentAt, incidentAt + windowSeconds]
```

사용 PromQL:

```promql
sum(chronos_http_request_duration_seconds_sum)
```

```promql
sum(chronos_http_request_duration_seconds_count)
```

HTTP latency Histogram에는 `method`, `status_code` label에 따라
여러 time-series가 존재할 수 있다.

예:

```text
GET 200
GET 500
POST 200
POST 400
```

Chronos v0.1의 metric summary는 전체 HTTP 요청에 대한 latency를 계산하므로
Prometheus query 시점에 `sum(...)`으로 이 series들을 하나로 aggregate한다.

이 aggregate 결과를 Chronos가 별도 저장하는 것은 아니다.

계산식:

```text
sumDelta
= last(sum counter) - first(sum counter)

countDelta
= last(count counter) - first(count counter)

averageLatency
= sumDelta / countDelta
```

`_sum`과 `_count`는 cumulative 값이므로 단순히
`lastSum / lastCount`를 계산하면 해당 before/after window의 평균이 아니라
metric 수집 시작 이후 누적 평균에 가까운 값이 된다.

따라서 window 안에서 증가한 값인 delta를 사용한다.

다음 상태는 계산 불가로 처리한다.

- aggregate series 없음
- aggregate series가 1개가 아님
- sample 2개 미만
- sample value가 유효한 숫자가 아님
- counter 감소/reset 감지
- `countDelta <= 0`
- 계산된 average latency가 유효하지 않음

`countDelta = 0`인 경우 `averageLatency = 0`이라고 반환하지 않는다.
이는 응답 시간이 0초였다는 뜻이 아니라 해당 window에서
계산 가능한 HTTP request가 없다는 의미이기 때문이다.

WBS 5.1에서 Incident 생성/종료 API가 구현되었지만,
`GET /metrics/summary`는 아직 실제 Incident DB와 자동 연결되어 있지 않다.

현재도 `incidentAt`은 `/metrics/summary` 요청에서 직접 전달받는
Unix timestamp seconds를 사용한다.

```text
GET /metrics/summary
?incidentAt=<unix seconds>
&windowSeconds=<positive integer>
```

아직 다음 동작은 존재하지 않는다.

- incident_id를 받아 DB에서 Incident 조회
- incidents.started_at 자동 사용
- automatic Incident detection

Metric Summary는 Incident 전후에 관측된 latency 값을 보여줄 뿐
latency 변화가 Incident의 원인이라고 주장하지 않는다.

예:

```text
before average latency = 0.02s
after average latency = 0.30s
```

이 결과는 Incident 전후에 해당 latency 값이 관측되었다는 의미다.
`latency 증가가 Incident의 원인이다`라고 해석하지 않는다.

### Discord

```text
Chronos API
↓
Discord
```

Discord는 기본적으로 Event Source가 아니라 notification destination으로 취급한다.

---

## 7. Common Event Model

모든 Event Source는 source-specific 데이터를 직접 시스템 전체에 퍼뜨리지 않고
Chronos 공통 Event 모델로 정규화한다.

논리 모델:

```text
Event
id              UUID
serviceId       UUID
source          EventSource
type            string
title           string
occurredAt      timestamp
receivedAt      timestamp
sourceEventId   string | null
metadata        JSON
```

예:

```text
Docker Raw Event
↓
Docker Adapter / Collector
↓
Chronos Event
```

```text
GitHub Webhook
↓
GitHub Adapter
↓
Chronos Event
```

Correlation, Incident, Timeline 등 downstream 시스템은
가능한 한 Source의 raw schema가 아니라 Chronos Event를 사용한다.

---

## 8. Event Naming

Event type은 namespace 형식을 사용한다.

현재:

```text
docker.container.start
docker.container.stop
docker.container.die
docker.container.restart

github.push
```

향후 필요하면:

```text
github.deployment
```

등을 추가한다.

---

## 9. Timestamp Rules

### occurredAt

외부 시스템에서 실제 사건이 발생한 시간.

### receivedAt

Chronos가 해당 Event를 수신한 시간.

두 시간을 혼동하지 않는다.

DB에는 `TIMESTAMPTZ`를 사용한다.

시간은 내부적으로 UTC 기준으로 다루고,
Web UI에서 사용자 timezone으로 변환한다.

Docker Event에서는 가능하면 `timeNano`를 사용하여
밀리초 수준의 `occurredAt`을 만든다.

---

## 10. Event Deduplication

`sourceEventId`는 동일한 외부 Event가 중복 수신될 경우
식별할 수 있도록 존재한다.

Docker는 별도의 Event UUID가 없으므로 현재 다음 정보를 조합한다.

```text
docker:<containerId>:<action>:<timeNano>
```

현재 DB에는 UNIQUE constraint를 강제하지 않는다.

필요해질 경우 다음과 같은 uniqueness 정책을 검토한다.

```text
(source, source_event_id)
```

---

## 11. Database

현재 핵심 테이블:

```text
services
events
incidents
incident_events
service_source_bindings
```

### Relationship

```text
Service 1 ─── N Event

Service 1 ─── N Incident

Incident N ─── M Event
             │
             └─ incident_events
```

`incident_events.score`는 Event 자체의 속성이 아니라
Incident와 Event 사이 관계의 속성이다.

`service_source_bindings`는 외부 Resource identifier를 통해
Chronos Service를 찾아야 하는 Source에서 사용하는 최소 mapping이다.

현재 contract:

```text
(source, resource_type, external_id)
→ service_id
```

모든 Source가 이 table을 사용하도록 강제하지 않는다.
Docker는 `chronos.service_id` label을 통해 직접 `serviceId`를 얻는다.

raw Prometheus metric time-series는 PostgreSQL에 복제하지 않는다.

역할 구분:

```text
Docker / GitHub Event
→ PostgreSQL

raw metric time-series
→ Prometheus
```

---

## 12. Correlation Score

WBS 5.2에서는 v0.1 Related Event ranking을 위해
시간 거리와 Event 종류만 사용하는 deterministic correlation rule을 정의한다.

`incident_events.score` 범위:

```text
0.0 ~ 1.0
```

UI에서는 필요하면 0~100 형태로 표현할 수 있다.

중요:

**score는 장애 원인일 확률이 아니다.**

이는 해당 Event가 Incident와 얼마나 관련성이 있는지 나타내는
relevance score이다.

Chronos는 이를 근거로 root cause를 확정하지 않는다.

### Candidate filtering

Correlation 후보는 Incident와 같은 Service에 속하는 Event로 제한한다.

```text
event.service_id = incident.service_id
```

다른 Service의 Event는 시간상 가까워도 후보가 아니다.

Incident reference timestamp는 `incidents.started_at`,
Event timestamp는 `events.occurred_at`을 사용한다.

`events.received_at`은 Chronos가 Event를 수신한 시각이므로
correlation 시간 계산에 사용하지 않는다.

Candidate time window는 Incident 시작 전 15분부터 시작 후 5분까지다.
양쪽 경계는 포함한다.

```text
incident.started_at - 15 minutes
<= event.occurred_at
<= incident.started_at + 5 minutes
```

이 범위 밖 Event는 후보에서 제외한다.

현재 정의된 다음 Event type만 v0.1 scoring 대상이다.

```text
github.push
docker.container.restart
docker.container.die
docker.container.stop
docker.container.start
```

정의되지 않은 Event type은 generic fallback weight를 적용하지 않고
v0.1 correlation 후보에서 제외한다.

### Time Weight

시간 bucket의 방향은 다음과 같이 결정한다.

- `event.occurred_at <= incident.started_at`이면 before
- `event.occurred_at > incident.started_at`이면 after

`delta`는 `incidents.started_at`과 `events.occurred_at` 사이의
실제 경과 시간(seconds)의 절대값이다.

Bucket 판정 전에 `delta`를 round, floor, truncate하거나
integer로 변환하지 않는다.
Timestamp의 실제 차이를 그대로 boundary와 비교한다.

예:

```text
59.9s before → before 0~1m → 1.00
60.0s before → before 0~1m → 1.00
60.1s before → before 1~5m → 0.80
```

따라서 Incident 시작 시각과 정확히 같은 Event는 before의 `delta = 0`이다.

| Event 위치 | 정확한 조건 | Time Weight |
|---|---|---:|
| Incident 전 0~1분 | before, `0 <= delta <= 60s` | 1.00 |
| Incident 전 1~5분 | before, `60s < delta <= 300s` | 0.80 |
| Incident 전 5~15분 | before, `300s < delta <= 900s` | 0.50 |
| Incident 후 0~1분 | after, `0 < delta <= 60s` | 0.60 |
| Incident 후 1~5분 | after, `60s < delta <= 300s` | 0.30 |
| window 밖 | 위 candidate window 밖 | 후보 제외 |

따라서 정확히 60초 전 Event는 1.00,
정확히 300초 전 Event는 0.80,
정확히 900초 전 Event는 0.50이다.

정확히 60초 후 Event는 0.60,
정확히 300초 후 Event는 0.30이다.

before window를 더 길게 두고 더 높은 weight를 부여하는 것은
Chronos의 핵심 질문인 "장애 직전에 무엇이 바뀌었는가?"를 우선하기 위함이다.
after Event도 recovery/restart 문맥을 제공할 수 있으므로 후보에 포함하지만
before보다 낮은 time weight를 사용한다.

### Event Type Weight

| Event Type | Type Weight | 의미 |
|---|---:|---|
| `github.push` | 1.00 | 배포/코드 변경과 직접 연결될 수 있는 변경 기록 |
| `docker.container.restart` | 0.95 | 실행 상태가 명시적으로 다시 시작된 변화 |
| `docker.container.die` | 0.90 | Incident와 밀접할 수 있는 runtime failure signal |
| `docker.container.stop` | 0.85 | 서비스 중단과 연결될 수 있는 상태 변화 |
| `docker.container.start` | 0.75 | 배포/재기동 문맥에서 관련될 수 있지만 start 자체는 상대적으로 약한 signal |

이 weight는 root cause probability가 아니라
v0.1 ranking을 위한 상대적인 relevance weight다.

예를 들어 `github.push = 1.00`은
GitHub push가 장애 원인일 확률이 100%라는 의미가 아니다.

### Final Score

최종 score는 추가 bonus나 penalty 없이 다음 곱으로 계산한다.

```text
score = timeWeight × typeWeight
```

현재 scoring에는 다음 정보를 사용하지 않는다.

- Event metadata
- GitHub author
- branch
- commit count
- commit message
- container image 비교
- Prometheus metric 값
- Source별 추가 multiplier
- ML
- heuristic chain

### Examples

| Event | Incident 기준 위치 | Time Weight | Type Weight | 결과 |
|---|---:|---:|---:|---:|
| `github.push` | 30초 전 | 1.00 | 1.00 | `1.00` |
| `docker.container.restart` | 3분 전 | 0.80 | 0.95 | `0.76` |
| `docker.container.die` | 30초 후 | 0.60 | 0.90 | `0.54` |
| `docker.container.start` | 10분 전 | 0.50 | 0.75 | `0.375` |
| `github.push` | 20분 전 | window 밖 | 1.00 | correlation 대상 제외 |

### Related Event Ranking

Related Changes / Potentially Relevant Events의 기본 정렬은 다음과 같다.

1. `score DESC`
2. 동일 score이면 Incident와의 절대 시간 거리 `ASC`
3. 그래도 같으면 `occurred_at DESC`
4. 그래도 같으면 `event.id ASC`

`event.id`는 relevance 의미를 가지지 않는다.
동일한 score, 절대 시간 거리, `occurred_at`을 가진 Event가 여러 개일 때
출력 순서를 안정적으로 결정하기 위한 final deterministic tie-breaker다.

Timeline의 chronological sorting과 Related Changes의 relevance ranking은 별개다.

```text
Timeline
→ 시간순

Related Changes
→ relevance score 중심
```

WBS 5.2에서는 top-N 개수를 정하지 않는다.
또한 correlation TypeScript/SQL 구현, `incident_events` persistence,
API endpoint, Metric Summary 연동은 수행하지 않는다.

---

## 13. Current API

현재 구현된 주요 endpoint:

```text
GET  /health

GET  /metrics

GET  /metrics/query-range

GET  /metrics/summary

GET  /events

POST /events

POST /incidents

POST /incidents/:id/resolve

GET  /services/:id/events

POST /webhooks/github
```

현재 `POST /events`는:

```text
HTTP Request
↓
Zod validation
↓
createEvent()
↓
Parameterized SQL
↓
events INSERT
↓
RETURNING *
```

흐름이다.

Event INSERT 로직은 `apps/api/src/events.ts`의
`createEvent()`로 최소 범위에서 공통화되어 있다.

현재 Event producer는 같은 persistence 경로를 사용한다.

```text
POST /events
→ Zod validation
→ createEvent()
→ PostgreSQL

GitHub Webhook
→ GitHub-specific validation / mapping / normalization
→ createEvent()
→ PostgreSQL
```

### Incident Lifecycle

Incident는 Event처럼 하나의 관측 사실을 표현하는 것이 아니라
서비스 장애 상황의 lifecycle을 표현한다.

현재 v0.1 Incident lifecycle은 다음 하나뿐이다.

```text
open → resolved
```

Incident 생성 endpoint:

```text
POST /incidents
```

client가 전달하는 값:

- `serviceId`
- `title`

server가 결정하는 값:

- `status = open`
- `started_at = CURRENT_TIMESTAMP`
- `resolved_at = NULL`
- `trigger_type = manual`

client가 lifecycle state나 timestamp를 임의로 결정하지 않는다.
존재하지 않는 Service로 생성하려 하면 HTTP 404로 처리한다.

Incident resolve endpoint:

```text
POST /incidents/:id/resolve
```

open Incident만 resolved로 전환한다.
resolve 시 `status = resolved`, `resolved_at = CURRENT_TIMESTAMP`를 기록한다.

이미 resolved인 Incident는 HTTP 409로 처리하며
기존 `resolved_at`을 새 시간으로 덮어쓰지 않는다.

현재 기존 `incidents` table을 그대로 사용하며
WBS 5.1에서 DB schema 또는 migration을 변경하지 않았다.

최소 책임 분리:

```text
apps/api/src/schemas/incident.ts
= HTTP input validation

apps/api/src/incidents.ts
= PostgreSQL persistence / lifecycle transition

apps/api/src/index.ts
= route / HTTP status mapping
```

현재 automatic Incident detection, Incident ↔ Event correlation,
Timeline / Related Changes, reopen, Incident list/detail API는 구현하지 않는다.

### Prometheus Metrics

현재 `apps/api`는 다음 endpoint를 통해
Prometheus exposition format의 application metric을 노출한다.

```text
GET /metrics
```

metric instrumentation에는 `prom-client`를 사용한다.

현재 수집하는 metric:

```text
chronos_http_requests_total
chronos_http_request_duration_seconds
```

HTTP request count와 duration은
Express middleware에서 response 완료 시점에 기록한다.

`/metrics` scrape 요청 자체는
application HTTP metric에서 제외한다.

현재 Prometheus는 이 endpoint를
`chronos-api` job으로 scrape한다.

```text
Prometheus
↓ GET /metrics
host.docker.internal:4000
↓
Chronos API
```

WBS 4.3에서는 Chronos API가 Prometheus에
range query를 수행하는 반대 방향의 query integration을 추가했다.

```text
Chronos API
↓ GET /metrics/query-range
Prometheus client
↓ GET /api/v1/query_range
Prometheus
```

`GET /metrics/query-range` query parameters:

- `query`
- `start`
- `end`
- `step`

Prometheus base URL은 `PROMETHEUS_URL` 환경변수를 사용하며,
기본값은 `http://localhost:9090`이다.

range query response는 검증 후 다음 구조로 반환한다.

- `resultType: matrix`
- `series`
  - `metric`: labels
  - `values`: `[timestamp, value]`

현재 오류 mapping:

- invalid/missing client parameter → HTTP 400
- Prometheus bad query → HTTP 400
- Prometheus network/upstream failure → HTTP 502
- invalid upstream response → HTTP 502

WBS 4.4에서는 `GET /metrics/summary`를 추가했다.

query parameters:

- `incidentAt`
- `windowSeconds`

처리 흐름:

```text
incidentAt ± windowSeconds
↓
before / after range
↓
queryPrometheusRange()
↓
sum(chronos_http_request_duration_seconds_sum)
sum(chronos_http_request_duration_seconds_count)
↓
counter delta
↓
averageLatency
```

응답에는 before/after 각각 `start`, `end`, `averageLatency`, `requestCount`를 포함한다.

계산 불가 metric window는 HTTP 422로 처리하며 정상적인 `0` latency로 위장하지 않는다.

`GET /metrics`는 metric exposition endpoint,
`GET /metrics/query-range`는 Prometheus query endpoint,
`GET /metrics/summary`는 조회된 metric을 Chronos 의미로 계산하는 summary endpoint다.

scrape, query, summary의 역할을 혼동하지 않는다.

### GitHub Webhook

현재 `POST /webhooks/github`는 GitHub Webhook을 직접 수신한다.

처리 흐름:

```text
GitHub Webhook
↓
raw request body 수신
↓
HMAC-SHA256 signature 검증
↓
JSON payload parsing
↓
GitHub event / delivery 식별
↓
repository.full_name으로 Service binding 조회
↓
serviceId 결정
↓
GitHub push → github.push Chronos Event normalization
↓
createEvent()
↓
PostgreSQL events
```

Webhook secret은 다음 환경변수를 사용한다.

```text
GITHUB_WEBHOOK_SECRET
```

서명 검증에는 GitHub가 전달하는 다음 헤더를 사용한다.

```text
X-Hub-Signature-256
```

또한 다음 헤더를 읽어 Webhook 종류와 delivery를 식별한다.

```text
X-GitHub-Event
X-GitHub-Delivery
```

현재 실제 GitHub repository Webhook을 통해 다음 Event의 수신을 검증했다.

```text
ping
push
```

GitHub push payload는 Chronos 공통 Event인 `github.push`로 정규화되고,
실제 Webhook redelivery를 통해 PostgreSQL `events` 테이블에 저장되는 것까지 검증했다.

GitHub repository → Chronos Service mapping은
`service_source_bindings`를 사용한다.

GitHub repository의 현재 lookup은 다음과 같다.

```text
source        = github
resource_type = repository
external_id   = repository.full_name
```

binding이 없는 repository는 Event로 저장하지 않고 정상 Webhook 응답으로 처리한다.

---

## 14. Current Docker Agent

현재 파일:

```text
apps/agent/src/
├─ index.ts
├─ docker.ts
└─ chronos.ts
```

### index.ts

Agent 실행 entry point.

Docker Collector를 시작한다.

### docker.ts

현재 담당:

- dockerode 사용
- Windows Docker Desktop named pipe 연결
- `//./pipe/docker_engine`
- Docker Event stream 구독
- container event 처리
- Docker raw Event parsing
- Chronos Event normalization
- normalized Event를 `sendEvent()`에 전달

현재 처리하는 Action:

```text
start
stop
die
restart
```

Service mapping에는 Docker label을 사용한다.

```text
chronos.service_id=<Chronos Service UUID>
```

Label이 없는 container event는 Chronos Event로 처리하지 않는다.

현재 Chronos Event metadata:

```text
containerId
containerName
image
action
```

현재 `sourceEventId`:

```text
docker:<containerId>:<action>:<timeNano>
```

### Stream Handling

Docker Event stream은 chunk 단위로 들어오므로
chunk 하나를 JSON 하나라고 가정하지 않는다.

문자열 buffer를 사용하고 newline 기준으로
완성된 JSON record만 parse한다.

잘못된 JSON 하나 때문에 Agent 전체가 종료되지 않도록
해당 record만 무시한다.

### chronos.ts

Chronos Host Agent가 정규화된 Event를
Chronos API로 전달하는 최소 API client다.

현재 API URL은 다음 환경변수를 사용한다.

```text
CHRONOS_API_URL
```

기본값:

```text
http://localhost:4000
```

현재 Docker Event ingestion 흐름:

```text
Docker Event
↓
Docker Collector
↓
Chronos Event normalization
↓
sendEvent()
↓
POST /events
↓
createEvent()
↓
PostgreSQL events
```

실제 Docker Event가 이 경로를 통해
PostgreSQL `events` 테이블에 저장되는 것을 검증했다.

### Docker Engine Reconnection

Docker 연결 실패 또는 stream 종료 시:

```text
3초 대기
↓
재연결
```

현재 fixed 3-second retry를 사용한다.

중복 reconnect timer가 생성되지 않도록 방지한다.

Docker Engine이 다시 시작되면 Agent는 event stream을 자동 복구한다.

현재 v0.1에서는 exponential backoff를 구현하지 않는다.

실제 Docker Engine 중단 상태에서 reconnect가 반복되고,
Engine 복구 후 stream이 다시 연결되며
이후 Event가 Chronos API로 정상 전송되는 것을 검증했다.

### API Delivery Retry

`sendEvent()`는 Chronos API가 일시적으로 사용할 수 없는 경우
bounded retry를 수행한다.

현재 설정:

```text
MAX_RETRIES = 2
RETRY_DELAY_MS = 1000
```

최초 요청을 포함해 최대 3회 전송을 시도하며,
retry 사이에는 fixed 1000ms delay를 사용한다.

모든 API delivery retry가 실패해도
Agent process와 Docker Event stream은 종료되지 않는다.

API 복구 후 동일 Agent process에서
이후 새 Docker Event가 정상적으로 다시 전송되는 것을 검증했다.

Docker Engine reconnect와 API delivery retry는
서로 독립된 책임으로 유지한다.

현재 persistent local queue나 disk-backed buffering은 구현하지 않는다.

---

## 15. Completed WBS

완료:

- 0.1 Scope freeze
- 0.2 Event model
- 0.3 Repository / API foundation
- 0.4 PostgreSQL + Docker Compose foundation

- 1.1 DB schema
- 1.2 Event ingestion API
- 1.3 Event query API

- 2.1 Docker Events experiment
- 2.2 Docker Agent MVP
- 2.3 Docker reconnect / error handling

- 3.1 GitHub Webhook endpoint
- 3.2 GitHub push Event 처리

- 4.1 Prometheus 기본 학습 및 실행
- 4.2 Demo metric 노출
- 4.3 Prometheus HTTP API 연동
- 4.4 장애 전후 metric summary

- 5.1 Incident 생성/종료 API
- 5.2 Correlation 규칙 설계

다음 작업은 Worker가 임의로 추측하지 않는다.
Supervisor가 기존 WBS를 확인한 뒤 다음 WBS를 명시적으로 할당한다.

---

# 16. Design Invariants

아래 원칙은 Chronos의 핵심 설계 결정이다.

특별한 이유 없이 변경하지 않는다.

### 1. Common Event Boundary

Source별 데이터는 가능한 한 초기에 Chronos Event로 정규화한다.

Downstream 기능이 Docker, GitHub 등의 raw payload 구조를
각각 이해하도록 만들지 않는다.

### 2. Agent는 Host-local Data를 담당한다

외부 Source가 추가된다고 Agent application을 하나씩 추가하지 않는다.

Agent가 필요한지는 Source가
사용자 Host 내부 접근을 필요로 하는지에 따라 결정한다.

### 3. API는 중앙 도메인 로직을 담당한다

Incident, Correlation, Event persistence 등은
Agent 내부에 구현하지 않는다.

Agent는 수집과 전달에 집중한다.

### 4. Chronos는 Root Cause를 단정하지 않는다

Timeline과 관련성 높은 변화를 제공한다.

Metric Summary 역시 Incident 전후 관측 값을 제공할 뿐
latency 변화가 root cause라고 단정하지 않는다.

### 5. Source-specific 정보는 metadata에 격리한다

공통 필드는 Event 최상위 모델에 두고,
Source 고유 데이터는 `metadata`에 저장한다.

---

# 17. Architecture as Chronos Grows

현재 규모에서는 단순한 구조를 유지한다.

현재 API의 주요 파일:

```text
apps/api/src/
├─ index.ts
├─ db.ts
├─ events.ts
├─ incidents.ts
├─ github.ts
├─ bindings.ts
├─ metrics.ts
├─ prometheus.ts
├─ metric-summary.ts
└─ schemas/
   ├─ event.ts
   └─ incident.ts

apps/agent/src/
├─ index.ts
├─ docker.ts
└─ chronos.ts
```

`apps/api/src/prometheus.ts`는 Prometheus HTTP 통신과 응답 검증을 담당한다.

`apps/api/src/metric-summary.ts`는 Prometheus range query 결과를 이용해
incident 기준 before/after HTTP average latency를 계산하는
최소 metric summary logic을 담당한다.

두 책임을 혼동하지 않는다.

```text
prometheus.ts
= Prometheus HTTP 통신 / 응답 검증

metric-summary.ts
= 조회된 metric을 Chronos 의미로 계산
```

규모가 실제로 커질 경우 점진적으로 분리한다.

---

## Agent Growth

현재:

```text
agent/src/
├─ index.ts
├─ docker.ts
└─ chronos.ts
```

Host-local Collector가 여러 개 생길 경우:

```text
agent/src/
├─ index.ts
├─ collectors/
│  ├─ docker.ts
│  ├─ systemd.ts
│  └─ system.ts
└─ client/
   └─ chronos.ts
```

형태를 고려한다.

현재 `chronos.ts`는 API delivery 책임을 담당하지만,
Docker Collector 하나뿐인 현재 시점에서는
이를 `client/chronos.ts`로 이동하거나
필요 이상의 폴더 계층을 만들지 않는다.

---

## API Growth

현재는 endpoint와 일부 orchestration이 `index.ts`에 존재하고,
Event persistence처럼 실제 중복 책임이 발생한 부분만 최소 범위로 분리되어 있다.

기능이 늘어나면 다음 형태를 고려한다.

```text
apps/api/src/
├─ index.ts
├─ db.ts
│
├─ routes/
│  ├─ events.ts
│  ├─ incidents.ts
│  └─ webhooks/
│     └─ github.ts
│
├─ services/
│  ├─ events.ts
│  ├─ incidents.ts
│  └─ correlation.ts
│
├─ integrations/
│  ├─ prometheus.ts
│  └─ discord.ts
│
└─ schemas/
```

이 구조는 현재 즉시 구현해야 하는 목표가 아니다.

실제 기능 증가로 책임 분리가 필요해질 때 적용한다.

---

## Event Service

GitHub Webhook이 두 번째 Event producer로 추가되면서
Event INSERT 로직은 `apps/api/src/events.ts`의 `createEvent()`로
최소 범위에서 공통화되었다.

현재:

```text
Agent POST /events ─────┐
                        ▼
                   createEvent()
                        │
                        ▼
                     events DB
                        ▲
                        │
GitHub Webhook ─────────┘
```

`POST /events`의 HTTP/Zod validation은 route 경계에 남아 있고,
GitHub Webhook은 GitHub-specific 검증, Service mapping, normalization 후
동일한 `createEvent()` persistence 함수를 사용한다.

목적:

- INSERT 로직 중복 방지
- Event persistence 책임을 API에 유지
- Event producer 증가에 따른 persistence 충돌 방지

현재 deduplication 정책은 기존대로 DB UNIQUE constraint를 강제하지 않는다.

---

## packages/shared

다음 상황이 발생하면 `packages/shared`를 실제로 사용한다.

예:

- Agent와 API에서 같은 Event type을 중복 정의
- Event contract 변경 시 여러 앱을 동시에 수정해야 함
- 공통 Zod schema가 필요함

예상 구조:

```text
packages/shared/
└─ src/
   └─ events.ts
```

현재 중복이 작다면 미리 추상화하지 않는다.

---

# 18. Scaling Principles

Chronos가 커지더라도 처음부터 다음 기술을 도입하지 않는다.

현재 필요하지 않음:

- Plugin SDK
- Dynamic plugin registry
- Kafka
- RabbitMQ
- 별도 Event Bus
- Microservices
- 복잡한 Dependency Injection framework
- Source별 독립 Agent application

이런 구조는 실제 문제가 발생했을 때 도입 여부를 판단한다.

예:

```text
Event 처리량이 API가 감당하기 어려움
→ Queue 검토

Agent Collector가 여러 개로 증가
→ Collector abstraction 검토

API route가 지나치게 커짐
→ routes/services 분리

여러 앱에서 Event type 정의가 중복됨
→ packages/shared 사용

단일 API 배포 단위가 실제 bottleneck이 됨
→ 그때 service 분리 검토
```

"언젠가 필요할 것 같다"는 이유만으로 구조를 복잡하게 만들지 않는다.

---

# 19. Development Principles

현재 개발 원칙:

- `main`: 안정된 버전
- `dev`: 현재 개발 버전

의미 있는 WBS 작업이 완료되고 테스트가 성공하면:

```text
implementation
↓
test
↓
STATUS / DECISIONS / CONTEXT 필요 시 갱신
↓
commit
↓
push dev
```

순서로 진행한다.

v0.1이 완성되고 E2E 검증이 끝난 뒤
`dev`를 `main`에 merge한다.

---

## 20. AI Development Workflow

Chronos 개발에서는 AI 역할을
Supervisor와 Worker로 구분하여 운영할 수 있다.

이 AI 역할은 `apps/agent`의 Chronos Host Agent와 별개의 개념이다.

세부 역할, 권한, escalation, review,
handoff 및 Specialist Worker(Codex) 사용 규칙은
`docs/AI_WORKFLOW.md`를 기준으로 한다.

---

## 21. Context Handoff Rule

새 ChatGPT 채팅 또는 새로운 개발 세션에서는
채팅 기억보다 실제 저장소와 문서를 우선한다.

다음 자료를 기준으로 현재 상태를 인수한다.

1. GitHub `dev` 브랜치의 실제 최신 코드
2. `docs/CONTEXT.md`
3. `docs/STATUS.md`
4. `docs/DECISIONS.md`
5. 기존 WBS
6. `docs/AI_WORKFLOW.md`

실제 코드와 문서가 충돌하면 최신 실제 코드를 먼저 확인한다.

Supervisor / Worker 역할,
작업 위임, escalation, review, handoff 규칙은
`docs/AI_WORKFLOW.md`를 기준으로 한다.

---

## 22. Development Collaboration Rule

Chronos 개발에서는
사용자가 실제 구현, 실행, 테스트, 디버깅 경험을
가능한 한 직접 수행하는 것을 기본 원칙으로 한다.

Architecture, DB/data model, integration structure 등
사용자가 충분한 판단 근거를 가지고 있지 않은 구조적 결정은
Assistant가 적극적으로 검토하고 이유를 설명한다.

세부적인 Supervisor / Worker 역할,
구현 범위, escalation 조건,
완성 코드 제공 기준은
`docs/AI_WORKFLOW.md`를 기준으로 한다.

---

## 23. Documentation Rule

Chronos의 장기적인 프로젝트 상태는
채팅 기억이 아니라 Git과 문서에 기록한다.

문서별 역할:

### `CONTEXT.md`

기록 대상:

- 중요한 architecture
- 현재 component 역할
- 외부 integration 방향
- 핵심 data contract
- Design Invariant
- 미래 확장 시 지켜야 할 구조적 방향

### `STATUS.md`

기록 대상:

- 현재 WBS 상태
- 현재 구현 상태
- 진행 중인 작업
- 현재 limitation
- 다음 작업
- 최근 검증된 상태

### `DECISIONS.md`

기록 대상:

- 중요한 architecture decision
- 검토한 대안
- 선택한 방향
- 선택 이유
- 재검토 조건

### `AI_WORKFLOW.md`

기록 대상:

- Supervisor / Worker 역할
- 작업 위임 방식
- escalation rule
- completion report
- AI handoff / replacement rule

기록하지 않아도 되는 것:

- 단순 문법 수정
- 사소한 변수명
- 일회성 디버깅 로그
- 이미 코드만 읽어도 명확한 구현 세부사항

각 문서는 실제 코드와 함께 계속 갱신한다.
