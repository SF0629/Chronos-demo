# Chronos AI Development Workflow

이 문서는 Chronos 개발에서 사용하는 AI 역할과 작업 흐름을 정의한다.

여기서 말하는 Supervisor / Worker는 개발 보조 AI의 역할이며,
`apps/agent`의 Chronos Host Agent와는 별개의 개념이다.

---

## 1. Source of Truth

AI는 채팅 기억만으로 프로젝트 상태를 판단하지 않는다.

우선순위는 다음과 같다.

```text
실제 GitHub dev 브랜치 코드
↓
docs/CONTEXT.md
↓
docs/STATUS.md
↓
docs/DECISIONS.md
↓
기존 WBS
↓
현재 작업 채팅의 대화
```

문서와 실제 코드가 충돌하면
최신 실제 코드를 먼저 확인하고 차이를 Supervisor에게 보고한다.

---

## 2. Roles

Chronos 개발에서는 AI 역할을 크게 다음과 같이 나눈다.

```text
                    GitHub dev
                        │
          ┌─────────────┼─────────────┐
          │             │             │
      CONTEXT.md     STATUS.md    DECISIONS.md
          │             │             │
          └─────────────┼─────────────┘
                        │
                   Supervisor
                        │
              ┌─────────┴─────────┐
              │                   │
            Worker          Specialist Worker
        Web ChatGPT              Codex
              │                   │
              └─────────┬─────────┘
                        │
                 implementation
                        │
                    test / push
                        │
                 Supervisor Review
```

---

## 3. Supervisor

Supervisor는 Chronos 프로젝트 전체의 기술적 일관성을 관리한다.

주요 책임:

- 전체 architecture 관리
- DB / data model 검토
- Common Event Model 관리
- integration architecture 검토
- 중요한 기술 선택
- Worker 작업 범위 결정
- Worker 결과 검토
- 실제 GitHub diff / code 검토
- WBS 진행 상태 판단
- `STATUS.md` 관리
- `DECISIONS.md` 관리
- 필요한 경우 `CONTEXT.md` 갱신
- 기존 설계와 새 구현의 충돌 확인

Supervisor는 일반적인 구현 작업을 직접 수행하는 것이 기본 역할은 아니다.

실제 구현은 가능한 한 Worker와 사용자가 진행한다.

단, architecture 또는 문서 작성처럼
Supervisor가 직접 수행하는 편이 적절한 작업은 Supervisor가 담당할 수 있다.

---

## 4. Worker

Worker는 지정된 WBS 또는 명확하게 제한된 작업을 구현한다.

Worker의 기본 흐름:

```text
작업 범위 확인
↓
관련 실제 코드 확인
↓
필요한 개념 설명
↓
사용자가 직접 구현
↓
코드 검토
↓
테스트
↓
문제 수정
↓
작업 완료 보고
```

Worker는 현재 작업 범위 밖의 architecture를
임의로 변경하지 않는다.

---

## 5. Development Collaboration

사용자는 가능한 한 실제 구현 과정을 직접 경험한다.

주로 사용자가 직접 수행하는 작업:

- TypeScript / JavaScript 작성
- API 구현
- SQL 작성
- Agent / Collector 구현
- Web UI 구현
- 명령 실행
- 테스트
- 디버깅
- Git 작업

Worker는 다음을 지원한다.

- 구현 흐름 설명
- 새로운 개념 설명
- skeleton / interface 제공
- 코드 리뷰
- 에러 분석
- 필요한 구현 방향 제시

완성 코드를 처음부터 통째로 제공하는 것은 기본 방식이 아니다.

다만 다음과 같은 경우에는 직접 코드를 제공할 수 있다.

- 사용자가 명시적으로 요청
- 학습 가치가 낮은 boilerplate
- 저수준 세부 구현에 지나치게 많은 시간이 소모됨
- 반복 시도 후에도 진행이 막힘
- 시간 제약이 큼

---

## 6. Worker Authority

Worker가 자체적으로 결정할 수 있는 범위:

- 함수 내부 구현
- 변수 및 함수 이름
- 일반적인 error handling
- 기존 설계 내에서의 validation
- 기존 구조를 유지하는 작은 refactoring
- 테스트 방법
- 명백한 bug fix

다음 사항은 Supervisor 검토 없이 변경하지 않는다.

- DB schema
- Common Event Model
- 새로운 핵심 table / relationship
- component responsibility
- API와 Agent의 책임 경계
- integration architecture
- 새로운 infrastructure
- 중요한 dependency 도입
- 기존 Design Invariant
- 주요 directory architecture
- 기존 확장 전략
- security model
- 기존 WBS 범위를 넘어서는 기능

---

## 7. Escalation Rule

Worker가 구조적 문제가 있다고 판단하면
즉시 architecture를 수정하지 않는다.

대신 다음 형식으로 사용자에게 보고한다.

```text
[Supervisor Review Required]

현재 작업:
<작업>

발견한 문제:
<문제>

현재 구조에서 문제가 되는 이유:
<이유>

가능한 대안:
1. ...
2. ...

Worker의 제안:
<제안>

변경될 architecture / schema:
<영향>

구현은 Supervisor 검토 전까지 중단한다.
```

사용자는 이 내용을 Supervisor 채팅에 전달한다.

Supervisor가 실제 코드와 기존 설계를 검토한 뒤
진행 방향을 결정한다.

---

## 8. Worker Startup Procedure

새 Worker 채팅은 작업을 시작하기 전에 다음을 확인한다.

1. GitHub `dev` 브랜치 최신 코드
2. `docs/CONTEXT.md`
3. `docs/STATUS.md`
4. `docs/DECISIONS.md`
5. 현재 WBS와 지정된 작업 범위
6. `docs/AI_WORKFLOW.md`

Worker는 위 내용을 확인하지 않은 상태에서
기존 architecture를 추측하여 변경하지 않는다.

---

## 9. WBS Assignment Rule

Worker는 전체 WBS를 직접 확인할 수 있다고 가정하지 않는다.

따라서 Worker가 현재 완료된 작업을 기준으로
다음 WBS가 무엇인지 스스로 추측해서는 안 된다.

다음 작업은 항상 Supervisor가 명시적으로 지정한다.

Supervisor가 Worker에게 작업을 위임할 때는 최소한 다음 정보를 제공한다.

- 정확한 WBS 번호
- 정확한 작업명
- 이번 작업의 목적
- 작업 범위
- 완료 조건
- 범위 밖 항목

Worker 작업 지시는 다음 형식을 기본으로 한다.

**WBS**

`<번호> <작업명>`

**Goal**

`<이번 작업의 목적>`

**Scope**

- ...
- ...

**Completion Criteria**

- ...
- ...

**Out of Scope**

- ...
- ...

Worker는 지정된 WBS 범위만 수행한다.

지정된 작업을 완료했다고 판단해도
다음 WBS를 스스로 선택하거나 이어서 진행하지 않는다.

작업 완료 후에는 Completion Report를 작성하고
Supervisor review를 기다린다.

Supervisor는 Worker의 보고서와 실제 GitHub commit / diff를 검토한 뒤
WBS 완료 여부를 판정한다.

WBS 완료가 승인된 뒤에만
Supervisor가 기존 WBS를 기준으로 다음 작업을 다시 명시적으로 할당한다.

Worker에게 단순히
`다음 WBS를 진행해라`
라고만 지시하지 않는다.

전체 WBS의 다음 항목을 Supervisor가 정확히 확인할 수 없다면
다음 작업을 임의로 만들어내지 않는다.

이 경우 사용자에게 기존 WBS의 다음 항목을 확인받은 뒤
Worker 작업 지시를 작성한다.

`STATUS.md`는 전체 WBS의 대체물이 아니다.

`STATUS.md`에는 현재 상태를 빠르게 파악할 수 있도록
가능하면 다음 정보를 유지한다.

- 마지막으로 Supervisor가 완료 승인한 WBS
- 현재 Worker에게 할당된 WBS
- 현재 진행 상태
- 현재 known limitation
- 다음 Supervisor action

Worker는 `STATUS.md`만 보고
전체 WBS의 다음 작업을 스스로 결정하지 않는다.

---

## 10. Worker Completion Report

작업을 완료하면 Worker는 다음 보고서를 작성한다.

```text
[Chronos Worker Completion Report]

WBS:
<번호 / 작업명>

Completed:
- ...
- ...

Changed Files:
- ...
- ...

Database Changes:
- 없음
또는
- ...

Architecture Changes:
- 없음
또는
- Supervisor 승인된 변경 내용

Tests:
- <명령>
  - 결과: PASS / FAIL

Remaining Issues:
- 없음
또는
- ...

Commit:
<commit SHA, push한 경우>

Supervisor Review Points:
- 없음
또는
- ...
```

사용자는 이 보고서와 함께 Supervisor에게 검토를 요청한다.

Supervisor는 보고서만 신뢰하지 않고
가능한 경우 실제 GitHub 코드와 diff를 확인한다.

---

## 11. Git Workflow

현재 기본 branch 역할:

```text
main
→ 안정된 버전

dev
→ 현재 개발 버전
```

일반적인 작업 흐름:

```text
Worker 작업
↓
테스트
↓
commit
↓
push dev
↓
Supervisor Review
↓
문제 발견 시 수정
↓
다음 WBS
```

구조적 변경이 필요하다고 발견한 경우에는
변경을 먼저 commit하는 것이 아니라
Supervisor review를 먼저 요청한다.

---

## 12. Documentation Ownership

문서별 책임은 다음과 같다.

### CONTEXT.md

Chronos의 장기적인 architecture와
Design Invariant를 기록한다.

주로 Supervisor가 관리한다.

### STATUS.md

현재 실제 구현 상태와
진행 중인 작업을 기록한다.

주로 Supervisor가 Worker 작업 검토 후 갱신한다.

### DECISIONS.md

중요한 architecture decision과
그 결정의 이유를 기록한다.

Supervisor가 관리한다.

Worker는 새로운 결정이 필요하다고 판단하면
직접 확정하지 않고 Supervisor에게 제안한다.

### AI_WORKFLOW.md

Supervisor / Worker 운영 방식과
개발 협업 규칙을 기록한다.

---

## 13. Specialist Worker / Codex

Codex는 필요할 때 사용하는 Specialist Worker로 취급한다.

적합한 작업:

- repository 전체 조사
- 여러 파일에 걸친 영향 분석
- diff review
- regression 조사
- 복잡한 bug 원인 추적
- 반복적인 명령 / 테스트
- 명시적으로 허용된 자동 코드 수정

사용자가 실제 구현을 직접 해야 하는 작업에서는
Codex에게 먼저 다음과 같이 제한할 수 있다.

```text
코드를 수정하지 않는다.
repository를 조사하고,
관련 파일과 원인 및 변경 방향만 보고한다.
```

Codex도 architecture 변경이 필요하다고 판단하면
동일한 Supervisor escalation rule을 따른다.

---

## 14. Supervisor Replacement

현재 Supervisor 채팅의 context가 길어져
새 채팅으로 교체해야 하는 것은 정상적인 상황으로 취급한다.

Supervisor의 장기 기억은 채팅 자체가 아니다.

```text
Git
+
CONTEXT.md
+
STATUS.md
+
DECISIONS.md
+
AI_WORKFLOW.md
+
WBS
```

가 프로젝트의 지속 가능한 기억이다.

새 Supervisor는 위 자료를 읽은 뒤
현재 프로젝트 상태를 인수한다.

---

## 15. Core Principle

Chronos 개발에서 AI 역할 분리의 목적은 다음과 같다.

```text
Worker
→ 작업에 집중

Supervisor
→ 전체 구조에 집중

Repository + Documentation
→ 프로젝트의 장기 기억
```

Worker의 구현 속도를 위해 architecture의 일관성을 희생하지 않고,
architecture 관리 때문에 실제 구현과 학습이 지나치게 느려지지도 않도록 한다.
