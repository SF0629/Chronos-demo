# Chronos Architecture Decisions

이 문서는 Chronos 개발 과정에서 내려진 중요한 설계 결정과
그 이유를 기록한다.

목적은 단순히 현재 구조를 기록하는 것이 아니라,
향후 개발 세션에서 이미 검토한 설계 논쟁을 반복하지 않도록 하는 것이다.

각 결정은 실제 요구사항이 바뀌거나
기존 가정이 더 이상 성립하지 않을 때 재검토할 수 있다.

---

## D-001 Common Event Model

### Decision

Docker, GitHub 등 Source별 Event는
가능한 한 초기에 Chronos 공통 Event 모델로 정규화한다.

```text
Source Raw Event
↓
Source-specific processing
↓
Chronos Event
↓
Correlation / Incident / Timeline
```

### Reason

Downstream logic이 Docker, GitHub 등
각 Source의 raw payload schema를 직접 이해하게 되면
Source가 증가할수록 시스템 전체가 Source-specific하게 결합된다.

공통 Event boundary를 두어
Source별 차이를 ingestion 단계에서 격리한다.

### Constraint

Source 고유 정보는 `metadata`에 저장한다.

---

## D-002 Host Agent Responsibility

### Decision

`apps/agent`는 Docker 전용 Agent가 아니라
Chronos Host Agent로 정의한다.

Host 내부 접근이 필요한 local collector들을 담당한다.

### Reason

새로운 Source가 추가될 때마다:

```text
docker-agent
systemd-agent
system-agent
...
```

형태로 application을 늘리는 것을 방지한다.

### Current State

현재 local collector는 Docker 하나뿐이므로
추가 abstraction은 만들지 않는다.

---

## D-003 Source Integration Method Is Not Uniform

### Decision

모든 Source를 동일한 방식으로 Chronos에 연결하지 않는다.

각 Source의 특성에 맞는 연결 방식을 사용한다.

### Examples

```text
Docker
→ Host Agent

GitHub
→ Webhook

Prometheus
→ API query

Discord
→ outbound notification
```

### Reason

Source의 역할과 접근 방식이 서로 다르기 때문에
하나의 범용 integration flow를 강제하면
오히려 복잡성이 증가한다.

---

## D-004 External Resource → Service Mapping

### Problem

GitHub push Webhook에는 Chronos의 `serviceId`가 존재하지 않는다.

Webhook에서 확인 가능한 값은 GitHub repository와 같은
외부 Resource identifier이다.

따라서 다음 문제가 발생했다.

```text
GitHub repository
→ ?
→ Chronos Service
```

### Rejected Option

`services` 테이블에 다음과 같은 Source-specific field를 추가하는 방식:

```text
github_repository
github_repo
```

### Reason for Rejection

이 방식을 반복하면 `services`가 다음처럼
integration-specific schema로 변할 가능성이 있다.

```text
services
├─ github_repository
├─ github_branch
├─ gitlab_project
├─ cloudflare_zone
├─ ...
```

또한 GitHub repository는 Service 자체의 본질적인 속성보다
외부 Resource와 Service 사이의 mapping에 가깝다.

### Decision

외부 Resource identifier를 통해 Service를 찾아야 하는 경우를 위해
최소한의 범용 mapping을 사용한다.

```text
service_source_bindings
```

Contract:

```text
(source, resource_type, external_id)
→ service_id
```

GitHub example:

```text
source        = github
resource_type = repository
external_id   = SF0629/Chronos-demo
```

### Important Constraint

이 binding system을 모든 Source에 강제하지 않는다.

Docker처럼 Event 자체 또는 local configuration에서
`serviceId`를 직접 얻을 수 있는 Source는
binding table을 사용할 필요가 없다.

### Non-goal

`service_source_bindings`는 다음을 위한 시스템이 아니다.

- Authentication
- OAuth configuration
- API token storage
- connection configuration
- 범용 Plugin system
- integration framework

오직 외부 Resource와 Chronos Service의 관계를 표현한다.

---

## D-005 External Resource Cardinality for v0.1

### Decision

현재 v0.1에서는 하나의 외부 Resource를
하나의 Chronos Service에만 연결한다.

현재 key:

```text
(source, resource_type, external_id)
```

### Supported

```text
Service A
├─ Repository 1
└─ Repository 2
```

### Not Currently Supported

```text
Repository 1
├─ Service A
└─ Service B
```

### Reason

하나의 GitHub repository를 여러 Service에 연결하는
대표적인 사례는 monorepo다.

하지만 monorepo를 정확히 지원하려면
단순한 N:M relationship만으로는 부족하다.

예:

```text
repository
+
path / filter / change scope
→ Service
```

같은 추가 semantics가 필요할 수 있다.

repository push 하나를 관련된 모든 Service에
무조건 연결하면 부정확한 correlation이 발생할 수 있다.

따라서 실제 monorepo 요구가 발생하기 전까지
현재 단순한 cardinality를 유지한다.

### Revisit When

- 하나의 repository가 실제로 여러 Chronos Service를 포함함
- Service별 path/filter mapping이 필요함
- 현재 cardinality 때문에 실제 Event attribution 문제가 발생함

---

## D-006 Do Not Generalize Before a Concrete Trigger

### Decision

미래 확장 가능성만으로 architecture를 미리 복잡하게 만들지 않는다.

### Examples

현재 바로 도입하지 않는다.

```text
Plugin SDK
Dynamic plugin registry
Kafka
RabbitMQ
Generic Event Bus
Microservices
Complex DI framework
Source-specific standalone agents
```

### Refactoring Trigger Examples

```text
Agent local collector 증가
→ collector abstraction 검토

여러 application에서 Event contract 중복
→ packages/shared 검토

API route가 지나치게 커짐
→ routes / services 분리

Event throughput이 API 처리 능력을 초과
→ queue 검토

단일 API deployment가 실제 bottleneck
→ service 분리 검토
```

---

## D-007 Event Persistence Should Remain Central

### Decision

Event persistence는 Chronos API의 중앙 domain responsibility로 유지한다.

Agent 또는 Source adapter가
PostgreSQL에 직접 접근하지 않는다.

### Current Situation

현재 Event producer는 다음 두 경로로 증가하고 있다.

```text
Agent
→ POST /events

GitHub Webhook
→ GitHub normalized Event
```

현재 `POST /events` 안에 Event INSERT 로직이 존재한다.

GitHub Event를 실제 DB에 저장하는 단계에서
INSERT 로직이 중복되기 시작하면
공통 Event service 추출을 우선 검토한다.

### Constraint

두 번째 producer가 생겼다는 이유만으로
API 전체 directory structure를 한꺼번에 재작성하지 않는다.

필요한 책임만 최소 범위로 분리한다.

---

## D-008 Root Cause Is Not a Chronos Claim

### Decision

Chronos는 Event가 Incident의 root cause라고 단정하지 않는다.

Correlation 결과는:

```text
Related Changes
Potentially Relevant Events
```

로 표현한다.

### Reason

시간적 상관관계와 제한된 telemetry만으로
실제 장애 원인을 확정하는 것은 부정확할 수 있다.

`incident_events.score`는
root cause probability가 아니라 relevance score다.

---

## D-009 Development Collaboration Model

### Decision

Architecture와 중요한 기술 판단은 Assistant가 적극적으로 검토한다.

실제 구현, 실행, 테스트와 디버깅은
가능한 한 사용자가 직접 수행한다.

### Meaning

```text
Assistant
→ architecture
→ DB/data model
→ integration design
→ structural review

User
→ implementation
→ command execution
→ testing
→ debugging
```

"사용자가 직접 개발한다"는 것은
모든 architecture를 배경지식 없이 직접 설계해야 한다는 의미가 아니다.

---

## D-010 Supervisor / Worker Workflow

### Decision

Chronos 개발은 역할을 다음처럼 분리한다.

```text
Supervisor Chat
→ architecture
→ design decision
→ worker result review
→ project status management

Worker Chat
→ 지정된 WBS 구현
→ test
→ debugging
```

### Escalation Rule

Worker가 다음 변경이 필요하다고 판단하면
구현 전에 Supervisor review를 받는다.

- DB schema
- Common Event contract
- component responsibility
- integration architecture
- infrastructure
- Design Invariant

### Source of Truth

장기적인 프로젝트 상태는 chat memory가 아니라 다음을 사용한다.

```text
Git repository
CONTEXT.md
STATUS.md
DECISIONS.md
기존 WBS
```
