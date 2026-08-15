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

### Current Assigned

- 없음

다음 WBS는 Worker가 임의로 추측하지 않는다.
Supervisor가 기존 WBS를 확인한 뒤 명시적으로 지정한다.

---

## Current Development Focus

Supervisor가 확인한 현재 완료 상태:

- WBS 2.2 Docker Agent MVP
- WBS 2.3 Agent 재연결 / 예외 처리
- WBS 3.1 GitHub Webhook endpoint
- WBS 3.2 GitHub push Event 처리
- WBS 4.1 Prometheus 기본 학습 및 실행
- WBS 4.2 Demo metric 노출

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

검증된 PromQL:

- `up`
- `up{job="prometheus"}`
- `up{job="chronos-api"}` = 1
- `chronos_http_requests_total`
- `chronos_http_request_duration_seconds_count`

현재 Prometheus는 Chronos의 Common Event Source가 아니라
Metric Store로 사용한다.

현재 Prometheus는 자체 metric과
Chronos API application metric을 수집한다.

아직 구현하지 않은 것:

- Prometheus HTTP API query integration
- `query_range`
- Incident metric summary

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

현재 Worker에게 할당된 다음 WBS는 없다.

다음 WBS는 Worker가 임의로 추측하지 않는다.
Supervisor가 기존 WBS를 확인한 뒤 명시적으로 지정한다.

불필요한 전체 API restructuring은 하지 않는다.

---

## Supervisor Review Rule

작업 채팅에서 다음 변경이 필요하다고 판단되면
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