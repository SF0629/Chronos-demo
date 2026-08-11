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

---

## 4. Repository Architecture

현재 기본 구조:

```text
Chronos-demo/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ agent/
├─ packages/
│  └─ shared/        # 공통 계약이 필요해질 때 사용
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

\***\*Chronos Host Agent\*\***이다.

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

```text
Chronos API
↓ Query
Prometheus HTTP API
```

Prometheus는 주로 Event Source가 아니라 Metric Store로 취급한다.

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
id              UUID
serviceId       UUID
source          EventSource
type            string
title           string
occurredAt      timestamp
receivedAt      timestamp
sourceEventId   string | null
metadata        JSON
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

---

## 12. Correlation Score

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

---

## 13. Current API

현재 구현된 주요 endpoint:

```text
GET  /health

GET  /events

POST /events

GET  /services/:id/events

POST /webhooks/github
```

현재 `POST /events`는:

```text
HTTP Request
↓
Zod validation
↓
Parameterized SQL
↓
events INSERT
↓
RETURNING *
```

흐름이다.

GitHub Webhook

현재 POST /webhooks/github는 GitHub Webhook을 직접 수신한다.

처리 흐름:

GitHub Webhook
↓
raw request body 수신
↓
HMAC-SHA256 signature 검증
↓
JSON payload parsing
↓
GitHub event / delivery 식별

Webhook secret은 다음 환경변수를 사용한다.

GITHUB_WEBHOOK_SECRET

서명 검증에는 GitHub가 전달하는 다음 헤더를 사용한다.

X-Hub-Signature-256

또한 다음 헤더를 읽어 Webhook 종류와 delivery를 식별한다.

X-GitHub-Event
X-GitHub-Delivery

현재 실제 GitHub repository Webhook을 통해 다음 Event의 수신을 검증했다.

ping
push

현재 단계에서는 검증된 GitHub payload를 parsing하고 확인하는 단계까지 구현되어 있다.

GitHub push payload를 Chronos 공통 Event인 github.push로 정규화하고 PostgreSQL에 저장하는 기능은 아직 구현되지 않았다.

이는 다음 WBS에서 진행한다.

---

## 14. Current Docker Agent

현재 파일:

```text
apps/agent/src/
├─ index.ts
└─ docker.ts
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

### Reconnection

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

### Current Limitation

현재 Docker Agent는 Docker Event를 Chronos 공통 Event 형태로
정규화하여 console에 출력하는 단계까지 구현되어 있다.

Agent가 정규화된 Event를 `POST /events`를 통해
Chronos API로 전송하는 기능은 아직 구현되지 않았다.

따라서 현재 Docker → Agent → API → PostgreSQL 전체 ingestion pipeline은
완성된 상태가 아니다.

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

다음 작업은 WBS의 다음 미완료 항목을 기준으로 진행한다.

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

### 5. Source-specific 정보는 metadata에 격리한다

공통 필드는 Event 최상위 모델에 두고,
Source 고유 데이터는 `metadata`에 저장한다.

---

# 17. Architecture as Chronos Grows

현재 규모에서는 단순한 구조를 유지한다.

현재:

```text
apps/api/src/
├─ index.ts
├─ db.ts
└─ schemas/

apps/agent/src/
├─ index.ts
└─ docker.ts
```

규모가 실제로 커질 경우 점진적으로 분리한다.

---

## Agent Growth

현재:

```text
agent/src/
├─ index.ts
└─ docker.ts
```

Host-local Collector가 여러 개 생길 경우:

```text
agent/src/
├─ index.ts
├─ collectors/
│  ├─ docker.ts
│  ├─ systemd.ts
│  └─ system.ts
└─ client/
   └─ chronos.ts
```

형태를 고려한다.

하지만 Docker Collector 하나뿐인 현재 시점에서는
필요 이상의 폴더 계층을 만들지 않는다.

---

## API Growth

현재는 endpoint와 DB 처리가 `index.ts`에 일부 함께 존재한다.

기능이 늘어나면 다음 형태를 고려한다.

```text
apps/api/src/
├─ index.ts
├─ db.ts
│
├─ routes/
│  ├─ events.ts
│  ├─ incidents.ts
│  └─ webhooks/
│     └─ github.ts
│
├─ services/
│  ├─ events.ts
│  ├─ incidents.ts
│  └─ correlation.ts
│
├─ integrations/
│  ├─ prometheus.ts
│  └─ discord.ts
│
└─ schemas/
```

이 구조는 현재 즉시 구현해야 하는 목표가 아니다.

실제 기능 증가로 책임 분리가 필요해질 때 적용한다.

---

## Event Service

현재 `POST /events`가 Event validation과 DB INSERT를 직접 담당한다.

GitHub Webhook처럼 두 번째 Event producer가 추가될 때:

```text
Agent POST /events ─────┐
                        ▼
                   Event Service
                        │
                        ▼
                     events DB
                        ▲
                        │
GitHub Webhook ─────────┘
```

형태로 Event 생성 로직을 공통 service로 분리하는 것을 우선 고려한다.

목적:

- INSERT 로직 중복 방지
- validation / deduplication 정책 통합
- Event producer 증가에 따른 충돌 방지

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
CONTEXT.md 필요 시 갱신
↓
commit
↓
push dev
```

순서로 진행한다.

v0.1이 완성되고 E2E 검증이 끝난 뒤
`dev`를 `main`에 merge한다.

---

## 20. Context Handoff Rule

새 ChatGPT 채팅 또는 새로운 개발 세션에서는:

1. 현재 GitHub `dev` 브랜치 코드 확인
2. `docs/CONTEXT.md` 확인
3. 현재 WBS 위치 확인
4. 기존 구조를 추측으로 변경하지 않음
5. 실제 코드와 문서가 충돌하면 실제 최신 코드를 먼저 확인
6. 구조 변경이 필요한 경우 기존 설계와의 차이와 이유를 먼저 설명

새 세션 시작 예시:

> Chronos 개발 계속.
> GitHub `dev` 브랜치의 최신 코드와 `docs/CONTEXT.md`를 먼저 확인하고,
> 실제 코드 구조와 기존 설계를 유지하면서 다음 WBS부터 진행하자.

---

## 21. Development Collaboration Rule

Chronos 개발에서는 사용자가 실제 개발 경험을 얻는 것을 중요하게 한다.

### User's Direct Work

사용자는 가능한 한 실제 구현 코드를 직접 작성한다.

주로 사용자가 직접 하는 범위:

- TypeScript / JavaScript 코드 작성
- API endpoint 구현
- SQL 작성
- Agent / Collector 구현
- Web UI 구현
- 테스트 명령 실행
- 에러 확인 및 수정
- Git 작업
- 실제 개발 과정에서 필요한 코드 변경

단순히 완성된 코드를 복사하는 방식보다는,
구조와 필요한 개념을 이해한 뒤 사용자가 직접 구현하는 것을 우선한다.

### Assistant's Responsibility

Assistant는 사용자가 아직 충분한 배경지식이 없는 부분을
사용자에게 근거 없이 직접 설계하도록 떠넘기지 않는다.

주로 Assistant가 먼저 검토하고 제안하는 범위:

- 전체 architecture
- 기술 stack 선택
- component responsibility
- DB schema 및 relationship 설계
- Event model과 data contract
- integration 방식
- 장기적인 확장 구조
- security / reliability 관련 구조적 결정
- 현재 구현이 기존 설계 및 향후 확장 방향과 충돌하는지 검토
- WBS 진행 순서

Assistant는 단순히 선택지를 나열하고 사용자에게 고르도록 하기보다,
현재 요구사항과 규모를 기준으로 적절한 선택을 판단하고 그 이유를 설명한다.

사용자가 판단할 수 있을 정도의 배경지식을 이미 가지고 있거나
여러 선택지 사이에 명확한 정답이 없는 경우에는
각 선택지의 trade-off를 설명한 뒤 함께 결정한다.

### Implementation Guidance

새로운 개념이 구현에 필요한 경우
Assistant는 실제 코드를 작성하기 전에 필요한 만큼 설명한다.

예:

- Promise / async / await
- PostgreSQL 문법
- Stream / Buffer
- Docker socket / named pipe
- Webhook
- 관계형 DB relationship
- 새로운 framework 또는 library의 핵심 개념

이미 설명했거나 사용자가 충분히 이해한 기초 개념을
매번 처음부터 반복해서 설명하지 않는다.

기본적인 진행 방식은 다음과 같다.

```text
설계 및 구현 흐름 설명
↓
새로운 개념이 있다면 필요한 만큼 설명
↓
필요한 interface / skeleton / 핵심 힌트 제시
↓
사용자가 실제 코드 작성
↓
Assistant가 코드 검토
↓
오류 수정 및 테스트
```

### When Full Code Is Appropriate

다음과 같은 경우에는 Assistant가 완성 코드 또는
상당 부분의 코드를 직접 제공할 수 있다.

- 사용자가 명시적으로 완성 코드를 요청한 경우
- library boilerplate처럼 직접 작성할 학습 가치가 낮은 부분
- 저수준 구현 세부사항 때문에 진행이 불필요하게 막히는 경우
- 사용자가 직접 여러 번 시도했지만 특정 부분에서 계속 막히는 경우
- 시간 제약으로 인해 직접 구현보다 빠른 진행이 우선되는 경우
- 정확한 구현 패턴을 직접 추론하기 어려운 기술적 세부사항

이 경우에도 핵심 동작과 해당 구현을 사용하는 이유는 설명한다.

### Important Distinction

"사용자가 직접 개발한다"는 것은
사용자가 architecture와 설계를 모두 처음부터 스스로 발명해야 한다는 뜻이 아니다.

사용자가 직접 경험해야 하는 핵심은 다음과 같다.

```text
실제 코드 작성
↓
실행
↓
결과 확인
↓
오류 발생
↓
원인 이해
↓
수정
↓
다시 테스트
```

즉 실제 개발 과정 자체를 경험하는 것이 목적이다.

반면 사용자가 아직 판단 근거를 가지고 있지 않은 상태에서
architecture, database design, distributed system design,
integration architecture 등을 무작정 선택하도록 요구하지 않는다.

### Architecture Changes

사용자의 질문이나 우려가 제기되었다는 이유만으로
기존 architecture를 변경하지 않는다.

구조 변경을 제안하기 전에 다음을 확인한다.

1. 현재 구조에 실제 문제가 존재하는가?
2. 현재 요구사항 또는 가까운 미래의 요구사항에서 문제가 발생하는가?
3. 단순한 우려가 아니라 변경을 정당화할 기술적 이유가 있는가?
4. 변경으로 얻는 이점이 복잡성 증가보다 큰가?

필요하지 않은 변경이라면
사용자의 우려가 타당한 부분과 그렇지 않은 부분을 구분하여 설명하고
기존 구조를 유지한다.

### Avoid

Assistant는 특별한 이유 없이 다음과 같이 진행하지 않는다.

- 처음부터 전체 구현 파일을 통째로 제공
- 사용자가 모르는 기술 선택을 무작정 사용자에게 결정하게 함
- 사용자가 이해하지 못한 상태에서 대량의 코드를 복사하게 함
- 이미 이해한 기초 문법을 반복적으로 길게 설명
- 사용자의 질문 때문에 필요하지 않은 architecture를 억지로 변경
- 미래 확장 가능성만을 이유로 과도한 추상화를 추가
- 실제 문제가 발생하지 않았는데 미리 복잡한 framework나 infrastructure를 도입
- 현재 코드와 `CONTEXT.md`를 확인하지 않고 기억이나 추측으로 구조를 변경

### Goal

Chronos 개발에서 유지해야 할 균형은 다음과 같다.

> 설계는 충분히 검토하고,
> 필요한 개념은 이해하며,
> 실제 구현은 가능한 한 사용자가 직접 한다.

Assistant는 설계와 기술적 판단을 보조하고,
사용자는 실제 구현과 실행 및 디버깅 경험을 최대한 직접 수행한다.

---

## 22. Collaboration Handoff Rule

새로운 ChatGPT 채팅 또는 개발 세션에서도
위 `Development Collaboration Rule`을 유지한다.

새 세션에서는 다음 순서로 진행한다.

1. GitHub `dev` 브랜치의 실제 최신 코드를 확인한다.
2. `docs/CONTEXT.md`를 확인한다.
3. 현재 WBS 진행 위치를 확인한다.
4. 기존 architecture와 design decision을 임의로 변경하지 않는다.
5. 실제 코드와 문서가 충돌하면 최신 실제 코드를 먼저 확인한다.
6. 구조 변경이 필요하면 기존 설계와 무엇이 달라지는지와 변경 이유를 먼저 설명한다.
7. `Development Collaboration Rule`을 유지하며 설계 판단과 실제 코드 작성의 역할을 임의로 바꾸지 않는다.
8. 사용자가 직접 구현해야 하는 부분이라면 먼저 완성 코드를 제공하지 않고 필요한 설계, 개념, skeleton 또는 힌트를 제공한다.
9. 사용자가 아직 판단할 배경지식이 없는 architecture나 기술 선택은 사용자에게 근거 없이 떠넘기지 않는다.

---

## 23. Documentation Rule

`CONTEXT.md`는 모든 코드 내용을 복사해두는 문서가 아니다.

기록 대상:

- 중요한 architecture decision
- 현재 component 역할
- 외부 integration 방향
- 핵심 data contract
- 완료된 WBS
- 다음 개발자가 반드시 알아야 할 구현 특성
- 미래 확장 시 지켜야 할 구조적 방향

기록하지 않아도 되는 것:

- 단순 문법 수정
- 사소한 변수명
- 일회성 디버깅 로그
- 이미 코드만 읽어도 명확한 구현 세부사항

이 문서는 코드와 함께 계속 갱신한다.
