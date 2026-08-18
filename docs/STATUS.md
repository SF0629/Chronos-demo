# Chronos Current Status

이 문서는 Chronos의 현재 개발 상태를 빠르게 파악하기 위한 문서다.

장기적인 architecture와 design rule은 `CONTEXT.md`,
작업 계획과 진행 순서는 기존 WBS,
중요한 설계 결정과 그 이유는 `DECISIONS.md`를 기준으로 한다.

---

## Current WBS

### Confirmed Complete

- 2.2 Docker Agent MVP — 완료
- 2.3 Agent 재연결 / 예외 처리 — 완료
- 3.1 GitHub Webhook endpoint — 완료
- 3.2 GitHub push Event 처리 — 완료
- 4.1 Prometheus 기본 학습 및 실행 — 완료
- 4.2 Demo metric 노출 — 완료
- 4.3 Prometheus HTTP API 연동 — 완료
- 4.4 장애 전후 metric summary — 완료
- 5.1 Incident 생성/종료 API — 완료
- 5.2 Correlation 규칙 설계 — 완료
- 5.3 관련 Event 계산 구현 — 완료
- 6.1 UI 와이어프레임 — 완료

### Current Assigned

- 없음

Last approved WBS:

- WBS 6.1 UI 와이어프레임

다음 WBS는 Worker가 임의로 추측하지 않는다.
Supervisor가 기존 WBS를 확인한 뒤 다음 WBS를 명시적으로 할당한다.

Next Supervisor action:

- Supervisor가 기존 WBS를 확인하고 다음 WBS를 명시적으로 할당

---

## Current Development Focus

Supervisor가 확인한 현재 완료 상태:

- WBS 2.2 Docker Agent MVP
- WBS 2.3 Agent 재연결 / 예외 처리
- WBS 3.1 GitHub Webhook endpoint
- WBS 3.2 GitHub push Event 처리
- WBS 4.1 Prometheus 기본 학습 및 실행
- WBS 4.2 Demo metric 노출
- WBS 4.3 Prometheus HTTP API 연동
- WBS 4.4 장애 전후 metric summary
- WBS 5.1 Incident 생성/종료 API
- WBS 5.2 Correlation 규칙 설계
- WBS 5.3 관련 Event 계산 구현
- WBS 6.1 UI 와이어프레임

WBS 6.1에서 v0.1 UI information architecture를 확정했다.

- Dashboard / Service Detail / Incident Detail의 정보 구조 확정
- Incident Detail hierarchy: Incident Summary → Related Changes → Metric Summary → Timeline
- Related Changes는 relevance 중심, Timeline은 chronology 중심으로 역할 분리
- 상세 wireframe Source of Truth: `docs/UI_WIREFRAME.md`
- 실제 UI code 구현은 아직 시작하지 않음

Docker Event와 GitHub push Event 모두
Chronos Common Event로 정규화된 뒤
Chronos API의 Event persistence 경로를 통해
PostgreSQL `events` 테이블에 저장되는 것을 검증했다.

Prometheus는 Docker Compose에서 실행되며 다음 상태를 검증했다.

- Prometheus UI `http://localhost:9090` 접속
- self-scrape target `job="prometheus"` 상태 UP
- PromQL `up` 조회
- PromQL `up{job="prometheus"}` 조회

WBS 4.2에서 Chronos API application metric 수집 경로를 추가했다.

- Chronos API가 `GET /metrics`로 Prometheus metric을 노출
- `prom-client` 사용
- HTTP request count 수집
- HTTP request duration 수집
- `/metrics` 요청 자체는 application HTTP metric에서 제외
- Prometheus `chronos-api` job이 Chronos API를 scrape
- `chronos-api` target state UP 검증
- 최소 2개 application metric PromQL 조회 검증

WBS 4.3에서 Chronos API → Prometheus query 경로를 구현했다.

```text
Chronos API
↓ GET /metrics/query-range
Prometheus client
↓ GET /api/v1/query_range
Prometheus
↓ matrix range data
Chronos API response
```

Chronos API endpoint:

- `GET /metrics/query-range`

query parameters:

- `query`
- `start`
- `end`
- `step`

Prometheus URL 설정:

- env: `PROMETHEUS_URL`
- default: `http://localhost:9090`

검증 완료:

- `chronos_http_requests_total` range query
- 서로 다른 `start` / `end` 범위 적용
- matrix result parsing
- metric labels 보존
- timestamp/value samples 보존
- 필수 parameter 누락 → HTTP 400
- invalid PromQL → HTTP 400
- Prometheus network failure → HTTP 502
- upstream failure 후 API process 유지
- 기존 `GET /metrics` regression 없음

WBS 4.4에서 Incident 시각 전후 HTTP average latency를 계산하는 최소 metric summary를 구현했다.

Chronos API endpoint:

- `GET /metrics/summary`

query parameters:

- `incidentAt`
- `windowSeconds`

현재 `incidentAt`은 실제 Incident DB/API와 아직 연결하지 않고
Unix timestamp seconds를 요청에서 직접 전달받는다.

구간:

```text
before = [incidentAt - windowSeconds, incidentAt]
after  = [incidentAt, incidentAt + windowSeconds]
```

사용 PromQL:

```text
sum(chronos_http_request_duration_seconds_sum)
sum(chronos_http_request_duration_seconds_count)
```

HTTP latency Histogram은 `method`, `status_code` label에 따라
여러 time-series가 존재할 수 있으므로 PromQL `sum(...)`에서 먼저 aggregate한다.

각 window에서 cumulative counter의 절대값을 직접 평균내지 않고
다음 delta를 계산한다.

```text
sumDelta = last(sum counter) - first(sum counter)
countDelta = last(count counter) - first(count counter)
averageLatency = sumDelta / countDelta
```

응답에는 before/after 각각 다음 값을 포함한다.

- `averageLatency`
- `requestCount`
- `start`
- `end`

계산 불가능한 metric window를 정상적인 `0` latency로 취급하지 않는다.

다음 상태는 계산 불가로 처리한다.

- aggregate series 없음 또는 1개가 아님
- sample 2개 미만
- 유효하지 않은 숫자 sample
- counter decrease/reset
- `countDelta <= 0`
- 유효하지 않은 average latency

기존 `apps/api/src/prometheus.ts`의 `queryPrometheusRange()`를 재사용하고,
raw Prometheus metric time-series는 PostgreSQL에 저장하지 않는다.

실제 검증에서 Windows host에서 생성한 Unix `incidentAt`을 그대로 사용해
`GET /metrics/summary`가 정상 응답하는 것을 확인했다.

검증된 예:

- before `averageLatency = 0.019259571428571414`
- before `requestCount = 7`
- after `averageLatency = 0.008437999999999987`
- after `requestCount = 8`

Metric summary는 Incident 전후 관측 값을 보여줄 뿐,
latency 변화가 Incident의 원인이라고 판단하지 않는다.

WBS 5.1에서 수동 Incident lifecycle API를 구현했다.

Incident 생성 endpoint:

- `POST /incidents`

client input:

- `serviceId`
- `title`

server-controlled values:

- `status = open`
- `started_at = CURRENT_TIMESTAMP`
- `resolved_at = NULL`
- `trigger_type = manual`

존재하지 않는 Service로 Incident를 생성하려 하면 HTTP 404로 처리한다.
invalid create input 또는 invalid Service UUID는 HTTP 400으로 처리한다.

Incident resolve endpoint:

- `POST /incidents/:id/resolve`

현재 lifecycle:

```text
open → resolved
```

resolve 시:

- `status = resolved`
- `resolved_at = CURRENT_TIMESTAMP`

이미 resolved된 Incident를 다시 resolve하면 HTTP 409로 처리한다.
UPDATE 대상은 `status = 'open'`인 row로 제한되어 repeated resolve가
기존 `resolved_at`을 덮어쓰지 않는다.

invalid Incident UUID는 HTTP 400,
존재하지 않는 Incident는 HTTP 404로 처리한다.

실제 PostgreSQL 환경에서 Incident create와 resolve를 검증했고,
create INSERT와 resolve UPDATE 및 `started_at` 유지,
repeated resolve 후 `resolved_at` 불변을 확인했다.

WBS 5.1에서는 기존 `incidents` table을 그대로 사용했으며
DB migration은 추가하지 않았다.

현재 아직 구현하지 않은 Incident 기능:

- automatic Incident detection
- Incident reopen
- Incident list API
- Incident detail API
- Incident UI
- Related Changes UI

WBS 5.2에서 v0.1 Correlation scoring rule을 문서로 확정했다.

핵심 규칙:

- 같은 `service_id`의 Event만 후보
- Incident 기준 시각: `incidents.started_at`
- Event 기준 시각: `events.occurred_at`
- candidate window: Incident 전 15분 / 후 5분
- `score = timeWeight × typeWeight`
- score는 root cause probability가 아닌 relevance score
- unknown Event type generic fallback 없음
- Related Event ranking: `score DESC` → absolute time distance `ASC` → `occurred_at DESC` → `event.id ASC`
- `delta`는 timestamp 실제 차이를 그대로 사용하며 bucket 판정 전 round/floor/truncate/integer conversion을 하지 않음

WBS 5.2에서는 설계만 수행했고,
WBS 5.3에서 해당 D-011 규칙을 runtime correlation과 API로 구현했다.

WBS 5.3에서 추가된 endpoint:

- `GET /incidents/:id/correlation`

현재 correlation 처리:

- Incident가 존재하면 open/resolved 여부와 무관하게 조회 가능
- same-service Event만 후보
- `incidents.started_at` ↔ `events.occurred_at` 기준
- Incident 시작 전 15분 / 후 5분 inclusive candidate window
- 지원 Event type 5개만 후보
  - `github.push`
  - `docker.container.restart`
  - `docker.container.die`
  - `docker.container.stop`
  - `docker.container.start`
- unknown Event type 제외
- 다른 Service Event 제외
- D-011 time/type weight로 score 계산
- fractional delta precision 유지
- `relatedEvents`: score 중심 relevance ranking
- `timeline`: chronological ordering
- 두 배열은 동일 candidate Event 집합을 서로 다른 ordering으로 반환
- arbitrary top-N 없음

relatedEvents ordering:

```text
score DESC
→ deltaSeconds ASC
→ occurred_at DESC
→ event.id ASC
```

timeline ordering:

```text
occurred_at ASC
→ event.id ASC
```

현재 correlation은 request 시점에 동적으로 계산한다.
`incident_events`에는 INSERT/UPDATE하지 않으며 DB migration도 추가하지 않았다.

실제 PostgreSQL/API integration 검증 완료:

- `GET /incidents/:id/correlation` → HTTP 200
- invalid Incident UUID → HTTP 400
- nonexistent Incident → HTTP 404
- same-service filtering
- supported Event type filtering
- unknown Event type exclusion
- different Service exclusion
- before -15m boundary 포함
- after +5m boundary 포함
- window 밖 Event 제외
- D-011 required score examples
- relatedEvents ordering 및 tie-breaker
- timeline ordering 및 tie-breaker
- relatedEvents / timeline 동일 candidate set
- `relatedEvents = 10`
- `timeline = 10`
- test fixture cleanup 완료
  - services remaining: 0
  - incidents remaining: 0
  - events remaining: 0

GitHub 처리 흐름:

```text
GitHub Webhook
↓
Raw request body
↓
HMAC-SHA256 signature verification
↓
Webhook payload parsing
↓
GitHub event type / delivery ID 확인
↓
Repository → Service binding 조회
↓
serviceId 결정
↓
GitHub push → Chronos Event normalization
↓
공통 createEvent()
↓
PostgreSQL events
```

실제 GitHub push Webhook redelivery를 통해
`github.push` Event가 PostgreSQL `events` 테이블에 저장되는 것까지 검증했다.

---

## GitHub Integration State

### Implemented

- `POST /webhooks/github`
- GitHub raw body 처리
- `X-Hub-Signature-256` 검증
- HMAC-SHA256 signature verification
- `X-GitHub-Event` 처리
- `X-GitHub-Delivery` 처리
- `ping` Webhook 수신 확인
- `push` Webhook 수신 확인
- GitHub push payload parsing
- GitHub push Event normalization
- repository → Chronos Service mapping
- binding이 없는 repository 처리
- normalized GitHub Event persistence
- 실제 `github.push` → PostgreSQL 저장 검증

### Current Service Mapping

GitHub repository를 Chronos Service와 연결하기 위해
다음 범용 mapping 구조를 사용한다.

```text
service_source_bindings
```

Lookup contract:

```text
(source, resource_type, external_id)
→ service_id
```

GitHub repository의 경우:

```text
source        = github
resource_type = repository
external_id   = repository.full_name
```

예:

```text
github
repository
SF0629/Chronos-demo
↓
Chronos service_id
```

---

## Current Database State

핵심 테이블:

```text
services
events
incidents
incident_events
service_source_bindings
```

`service_source_bindings`는 외부 Resource identifier를 이용해
Chronos Service를 찾아야 하는 Source에서 사용할 수 있는 mapping이다.

모든 Source가 이 테이블을 사용하도록 강제하지 않는다.

예를 들어 Docker는:

```text
chronos.service_id
```

label을 통해 직접 `serviceId`를 얻으므로
현재 binding table을 사용하지 않는다.

`incident_events` table은 기존 schema 그대로 존재한다.
WBS 5.3 correlation은 request 시점에 계산하며 현재 이 table에 score를 persistence하지 않는다.

---

## Current GitHub Binding Constraint

현재 `service_source_bindings`의 key는 다음과 같다.

```text
(source, resource_type, external_id)
```

따라서 현재 v0.1에서는 하나의 외부 Resource가
동시에 여러 Chronos Service에 연결되지 않는다.

즉 GitHub repository 기준으로:

```text
Repository 1 → Service 1
```

을 기본 모델로 사용한다.

하나의 Service가 여러 외부 Resource를 가지는 것은 가능하다.

향후 monorepo 등으로 인해 하나의 repository를
여러 Service에 연결해야 할 실제 요구가 발생하면
path/filter 등의 의미까지 포함하여 다시 설계한다.

단순히 N:M 관계를 허용하는 것만으로
monorepo 지원이 해결된다고 가정하지 않는다.

---

## Event Persistence State

Event INSERT 로직은 `apps/api/src/events.ts`의
`createEvent()`로 최소 범위에서 공통화되어 있다.

현재 producer 흐름:

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

Event persistence는 계속 Chronos API의 중앙 책임으로 유지한다.

---

## Docker Agent State

현재 Docker Agent:

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

구현 완료:

- Docker Event stream
- container Event filtering
- `chronos.service_id` label mapping
- Event normalization
- `timeNano` 기반 timestamp
- invalid JSON isolation
- Docker Engine stream reconnect
- Docker Engine 재시작 후 stream 복구
- `sendEvent()`를 통한 Chronos API Event 전달
- `CHRONOS_API_URL` 기반 API endpoint 설정
- Chronos API delivery bounded retry
- API 전송 실패 시 Agent process 유지
- API 복구 후 이후 새 Event 전송 정상화
- Docker → Agent → API → PostgreSQL ingestion pipeline 완료

Chronos API URL은 다음 환경변수를 사용한다.

```text
CHRONOS_API_URL
```

기본값:

```text
http://localhost:4000
```

API Event delivery는 bounded retry를 사용한다.

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

Docker Engine 연결 실패 또는 stream 종료 시에는
기존 fixed 3000ms reconnect를 유지한다.

Docker Engine 중단 상태에서 reconnect가 반복되고,
Docker Engine 복구 후 event stream이 다시 연결되며,
이후 Event가 Chronos API로 정상 전송되는 것을 검증했다.

Docker Engine reconnect와 Chronos API delivery retry는
서로 별개의 책임으로 유지한다.

현재 persistent local queue 또는 disk-backed buffering은
구현하지 않는다.

---

## Prometheus State

현재 실행 구조:

```text
Docker Compose
↓
chronos-prometheus
↓
infra/prometheus.yml
```

현재 설정:

- image: `prom/prometheus`
- host port: `9090`
- scrape interval: `15s`

현재 scrape jobs:

- `prometheus`
  - target: `localhost:9090`
  - self-scrape
  - target state: UP

- `chronos-api`
  - target: `host.docker.internal:4000`
  - Chronos API `GET /metrics`
  - target state: UP

현재 Chronos application metrics:

- `chronos_http_requests_total`
  - type: Counter
  - labels: `method`, `status_code`

- `chronos_http_request_duration_seconds`
  - type: Histogram
  - labels: `method`, `status_code`

### Metric exposure / scrape

```text
HTTP request
→ Chronos API Counter / Histogram 갱신

Prometheus
→ GET Chronos API /metrics
→ raw metric time-series 저장
```

Prometheus가 Chronos API를 pull 방식으로 scrape하며 현재 scrape interval은 `15s`다.

`/metrics` 요청 자체는 application HTTP metric에서 제외한다.
Prometheus가 metric을 측정하기 위해 수행하는 scrape 요청 자체가
application HTTP metric을 계속 증가시키는 것을 방지하기 위함이다.

### Metric query

```text
Chronos API
→ Prometheus HTTP API /api/v1/query_range
→ matrix time-series 반환
```

Chronos는 metric이 필요할 때 Prometheus를 query한다.
`query_range`가 15초마다 주기적으로 실행되는 것이 아니다.
주기적으로 실행되는 것은 Prometheus → Chronos API `/metrics` scrape다.

Prometheus query endpoint:

- Chronos API: `GET /metrics/query-range`
- Prometheus upstream: `GET /api/v1/query_range`
- env: `PROMETHEUS_URL`
- default: `http://localhost:9090`

기존 client `apps/api/src/prometheus.ts` 책임:

- Prometheus HTTP API 호출
- `query`
- `start`
- `end`
- `step`
- response JSON validation
- `matrix` result parsing
- label 보존
- `[timestamp, value]` sample 보존
- upstream/network error mapping

Prometheus query 결과와 raw metric time-series는 Chronos PostgreSQL에 저장하지 않는다.

### Metric summary

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

사용 metric:

```text
sum(chronos_http_request_duration_seconds_sum)
sum(chronos_http_request_duration_seconds_count)
```

HTTP latency Histogram에는 `method`, `status_code` label에 따라 여러 time-series가 존재할 수 있다.
Chronos v0.1의 metric summary는 전체 HTTP 요청에 대한 latency를 계산하므로
Prometheus query 시점에 `sum(...)`으로 이 series들을 하나로 aggregate한다.
이 aggregate 결과도 Chronos가 별도 저장하지 않는다.

계산식:

```text
sumDelta = last(sum counter) - first(sum counter)
countDelta = last(count counter) - first(count counter)
averageLatency = sumDelta / countDelta
```

`_sum`과 `_count`는 cumulative 값이므로 `lastSum / lastCount`를 계산하면
해당 before/after window 평균이 아니라 metric 수집 시작 이후 누적 평균에 가까운 값이 된다.
따라서 window 안에서 증가한 delta를 사용한다.

다음 상태는 계산 불가로 처리한다.

- aggregate series 없음
- aggregate series가 1개가 아님
- sample 2개 미만
- sample value가 유효한 숫자가 아님
- counter 감소/reset 감지
- `countDelta <= 0`
- 계산된 average latency가 유효하지 않음

`countDelta = 0`인 경우 `averageLatency = 0`으로 반환하지 않는다.
이는 응답 시간이 0초였다는 뜻이 아니라 해당 window에서 계산 가능한 HTTP request가 없다는 의미다.

현재 `incidentAt`은 실제 Incident API가 존재하더라도 Incident DB와 자동 연결되지 않고
`GET /metrics/summary` 요청에서 직접 전달받는 Unix timestamp seconds다.

```text
GET /metrics/summary
?incidentAt=<unix seconds>
&windowSeconds=<positive integer>
```

아직 다음 동작은 존재하지 않는다.

- incident_id를 받아 DB에서 Incident 조회
- incidents.started_at 자동 사용
- automatic Incident detection

현재 Prometheus는 Chronos의 Common Event Source가 아니라 Metric Store로 사용한다.

역할 구분:

```text
Docker / GitHub Event
→ PostgreSQL

raw metric time-series
→ Prometheus
```

Metric Summary는 Incident 전후 관측 값을 보여줄 뿐 root cause를 주장하지 않는다.
예를 들어 after latency가 증가해도 이를 Incident 원인이라고 해석하지 않는다.

검증 완료:

- `chronos_http_requests_total` range query
- 서로 다른 `start` / `end` 범위 조회
- matrix result parsing
- metric labels 및 timestamp/value samples 보존
- 필수 parameter 누락 → HTTP 400
- invalid PromQL → HTTP 400
- Prometheus network failure → HTTP 502
- upstream failure 후 API process 유지
- 기존 `GET /metrics` regression 없음
- `GET /metrics/summary` 정상 응답
- before/after average latency numeric value 반환
- before/after requestCount > 0

---

## Current Known Architectural Decisions

현재 반드시 유지해야 하는 주요 방향:

```text
Source-specific input
↓
Source-specific mapping / adapter logic
↓
serviceId 결정
↓
Common Chronos Event
↓
공통 downstream 처리
```

Source마다 `serviceId`를 결정하는 방법은 달라도 된다.

예:

```text
Docker
→ container label

GitHub
→ service_source_bindings

Future Source
→ 해당 Source에 적절한 방식
```

정규화 이후에는 Source-specific mapping 방식이
downstream logic에 노출되지 않도록 한다.

---

## Next Work

Last approved WBS:

- WBS 6.1 UI 와이어프레임

Current assigned WBS:

- 없음

다음 WBS는 Worker가 임의로 추측하지 않는다.
Supervisor가 기존 WBS를 확인한 뒤 다음 WBS를 명시적으로 할당한다.

Next Supervisor action:

- Supervisor가 기존 WBS를 확인하고 다음 WBS를 명시적으로 할당

불필요한 전체 API restructuring은 하지 않는다.

---

## Supervisor Review Rule

작업 채팅에서 다음 변경이 필요하다고 판단하면
바로 구현하지 않고 총괄 검토를 먼저 받는다.

- DB schema 변경
- Common Event Model 변경
- component responsibility 변경
- 새로운 infrastructure 도입
- 새로운 dependency의 구조적 도입
- integration architecture 변경
- 기존 Design Invariant 변경

일반적인 구현 세부사항과 버그 수정은
작업 채팅에서 계속 진행할 수 있다.
