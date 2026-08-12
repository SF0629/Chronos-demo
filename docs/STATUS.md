# Chronos Current Status

이 문서는 Chronos의 현재 개발 상태를 빠르게 파악하기 위한 문서다.

장기적인 architecture와 design rule은 `CONTEXT.md`,
작업 계획과 진행 순서는 기존 WBS,
중요한 설계 결정과 그 이유는 `DECISIONS.md`를 기준으로 한다.

---

## Current WBS

- 3.1 GitHub Webhook endpoint — 완료
- 3.2 GitHub push Event 처리 — 완료

---

## Current Development Focus

WBS 3.2의 목표였던 GitHub push Webhook의 Common Event 변환과
실제 Event persistence 연결까지 완료했다.

현재 처리 흐름:

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
console output
```

구현 완료:

- Docker Event stream
- container Event filtering
- `chronos.service_id` label mapping
- Event normalization
- `timeNano` 기반 timestamp
- invalid JSON isolation
- reconnect
- Docker Engine 재시작 후 stream 복구

아직 Agent → API Event 전송은 구현되지 않았다.

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

WBS 3.2는 완료되었다.

다음 작업은 기존 WBS의 다음 미완료 항목을 기준으로 진행한다.

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
