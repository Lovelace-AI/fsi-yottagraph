# Agent-First FSI Credit Monitor — Product Requirements Document

**Created:** 2026-04-07
**Author:** Lovelace AI
**Status:** Draft
**App ID:** agent-first-fsi

---

## 1. Product Vision

### What We're Building

An **agent-first credit risk monitoring platform** where agents — not manual pipelines — do the work of gathering data, interpreting context, running analytics, and surfacing results. The application demonstrates Lovelace's thesis: when agents operate over shared context (Elemental), they produce defensible, evidence-backed intelligence that scales beyond what manual analyst workflows can achieve.

### The Core Experience Shift

**The analyst loads a project (a list of entities) and agents continuously gather, analyze, and surface what matters.** The UI is an artifact viewer and control surface — not a data integration tool.

### What Makes This Different From the Current App

The current FSI Credit Monitor has ~300 Python ingestion scripts and local SQLite/Postgres pipelines for processing SEC filings, news, stocks, and other data sources. That architecture was necessary before Elemental existed. Now that Elemental is operational, the rebuild eliminates all local ingestion in favor of a single data contract:

```
Current:  Raw Data → Python Ingest → Local DB → UI
New:      Elemental (YottaGraph + Customer KG) → MCP Tools → Agents → UI
```

The app retains only a lightweight `projects.db` for user state (project definitions, assessments, agent configs, session traces). All entity data, relationships, events, properties, and evidence come from Elemental.

### Design Principles

1. **Agent-First** — Agents do the work. The UI surfaces what agents produce.
2. **Elemental as Ground Truth** — No local data ingestion. Elemental MCP is the sole data source.
3. **Evidence-Backed** — Every analytical output traces back to source material through Elemental provenance.
4. **Human-in-the-Loop** — Agents propose; analysts decide. Assessments are first-class data.
5. **Runtime Context Resolution** — Ambiguity is resolved at query time, not assumed away.
6. **Progressive Disclosure** — Default views are scannable; depth is available on click.

---

## 2. The Four-Agent Runtime Pipeline

Every user interaction that requires data flows through a four-agent pipeline. This maps directly to the "Runtime Context Interface" paper (the reference librarian concept) and the agent taxonomy from "Demonstrating Agent-Driven Intelligence" (monitoring, analytic, composition, control agents).

### Pipeline Flow

```
User Request or Standing Instruction
        │
        ▼
┌─────────────────────────────────────────┐
│  DIALOGUE AGENT (Context Interface)     │
│                                         │
│  Resolves ambiguity:                    │
│  - Entity: "Google" → Alphabet (NEID)   │
│  - Temporal: "recent" → last 90 days    │
│  - Scope: "our exposure" → project list │
│  - Intent: exploring vs briefing        │
│                                         │
│  Output: Structured Retrieval Plan      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  HISTORY AGENT (Knowledge Graph)        │
│                                         │
│  Executes retrieval against Elemental:  │
│  - elemental_get_entity (facts/props)   │
│  - elemental_get_related (relationships)│
│  - elemental_get_events (events)        │
│  - elemental_graph_neighborhood (graph) │
│  - elemental_graph_sentiment (news)     │
│                                         │
│  Output: Context Package                │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  QUERY AGENT (Analytical Reasoning)     │
│                                         │
│  Runs analytical modules over context:  │
│  - FHS: Solvency ratios, leverage,      │
│         equity erosion, margin trends   │
│  - ERS: Officer turnover, board changes,│
│         departure patterns              │
│  - Fused risk scoring                   │
│  - Generative narrative (if briefing)   │
│                                         │
│  Output: Analytical Result + Evidence   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  COMPOSITION AGENT (Output Formatting)  │
│                                         │
│  Formats for the right surface:         │
│  - Notification card                    │
│  - Table row update                     │
│  - Entity modal content                 │
│  - Timeline entry                       │
│  - Narrative text block                 │
│  - Graph node/edge update               │
│  - Dashboard metric                     │
│                                         │
│  Output: Formatted artifact → UI (SSE)  │
└─────────────────────────────────────────┘
```

### Agent Details

#### Agent 1: Dialogue Agent (Context Interface)

The "reference librarian." Sits between the caller and retrieval. Resolves the six types of runtime ambiguity from the Runtime Context Interface paper:

| Ambiguity Type | Example               | Resolution                                               |
| -------------- | --------------------- | -------------------------------------------------------- |
| **Entity**     | "Google"              | Alphabet Inc. (NEID) based on workflow context           |
| **Temporal**   | "recent"              | Last 90 days; "before the deal" → specific event date    |
| **Scope**      | "our exposure"        | Current project's entity list                            |
| **Intent**     | Free-form question    | Classify as exploring / triaging / monitoring / briefing |
| **Metric**     | "risk" or "connected" | Map to specific analytical module(s)                     |
| **Event**      | "the incident"        | Disambiguate among multiple candidate events             |

**Implementation:**

- Gemini-backed agent with system prompt encoding the project's entity list, active workflow, and domain priors
- Maintains conversational state per session
- When confidence is high, resolves silently; when low, asks a narrowing question
- Outputs a **Structured Retrieval Plan**: list of resolved NEIDs, time windows, relationship types to traverse, analytical modules to invoke

#### Agent 2: History Agent (Knowledge Graph Retrieval)

Executes the retrieval plan against Elemental MCP. This is a deterministic tool-calling agent — it follows the plan, not generative reasoning.

**Elemental MCP tools it calls:**

| Tool                           | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `elemental_get_entity`         | Entity facts, identifiers, historical property series         |
| `elemental_get_related`        | Relationships by flavor (organization, person, etc.) and type |
| `elemental_get_events`         | Events with participants, dates, categories                   |
| `elemental_graph_neighborhood` | N-hop subgraph for network context                            |
| `elemental_graph_sentiment`    | Sentiment signals for news-linked entities                    |
| `elemental_get_schema`         | Available relationship types, property families               |

**Implementation:**

- Parallelizes independent MCP calls (bounded concurrency of 8-10, per BNY findings)
- Normalizes NEIDs (strips leading zeros — critical for cross-tool consistency)
- Sets data availability flags: `has_financial_data`, `has_governance_data`, `has_recent_events`, `has_news_signals`
- Outputs a **Context Package**: entities, relationships, events, properties, evidence citations

#### Agent 3: Query Agent (Analytical Reasoning)

Takes the retrieved context and produces analytical answers. This is where the analytical modules run and where generative synthesis happens.

**Analytical Modules (Phase 1):**

| Module                   | Abbreviation | What It Scores                   | Key Signals                                                                                                                                |
| ------------------------ | ------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Financial Health Scoring | FHS          | Solvency and financial stability | Leverage ratio, debt/equity, interest coverage, current ratio, margin trends, equity erosion, staleness decay                              |
| Executive Risk Scoring   | ERS          | Governance quality and stability | Officer departures (recency-weighted), C-suite premium (CEO=1.5x, CFO=1.4x), board changes, auditor changes, cumulative departure patterns |

**Fused Risk Score:** Configurable weighted blend (default: FHS 60%, ERS 40%). When lenses diverge, the agent flags agreement/conflict indicators.

**Implementation:**

- Gemini-backed agent with analytical module prompts
- Receives the Context Package, not raw Elemental data
- Produces structured outputs: scores (0-100), risk drivers with evidence chains, severity assessment (Critical/High/Watch/Normal)
- When intent is "explain" or "brief," generates narrative prose

#### Agent 4: Composition Agent (Output & Notification)

Formats the analytical result into the right output for the right surface. Never alters the analysis — only decides presentation.

**Output Formats:**

| Format            | Surface                 | When Used                             |
| ----------------- | ----------------------- | ------------------------------------- |
| Notification card | Toast / alert feed      | Threshold crossed, new event detected |
| Table row         | Data Sources table view | Entity scan complete                  |
| Entity profile    | Entity modal            | User clicks entity                    |
| Timeline entry    | Event timeline view     | New event discovered                  |
| Narrative block   | Narrative view          | User requests narrative               |
| Graph delta       | Network graph view      | New relationships discovered          |
| Dashboard metric  | Risk dashboard          | Score update                          |

**Implementation:**

- Template-driven composition with evidence embedding
- Pushes to browser via SSE (`/api/lovelace/agents/activity-stream`)
- Writes results to `projects.db` for persistence and historical tracking

---

## 3. Application Structure

### 3.1 Feature Modules

The app ships with **5 feature modules** in Phase 1:

| Module            | Route            | Purpose                                                                          | Nav Order |
| ----------------- | ---------------- | -------------------------------------------------------------------------------- | --------- |
| **Projects**      | `/` (home)       | Load/create/switch projects (entity lists)                                       | 0         |
| **Data Explorer** | `/data-explorer` | View project entities through 5 lenses: Table, Graph, Modal, Timeline, Narrative | 1         |
| **Agents**        | `/agents`        | Configure, monitor, and interact with the four-agent pipeline                    | 2         |
| **Dashboard**     | `/dashboard`     | Monitor project risk: FHS + ERS scores, trends, alerts                           | 3         |
| **Settings**      | `/settings`      | Elemental MCP connection, Gemini API key, agent config                           | 10        |

### 3.2 Project Loading

A project is a named list of entities the user wants to monitor. This is the entry point for everything.

**Data model (`projects.db`):**

| Table                 | Columns                                                                                  | Purpose                                    |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| `projects`            | id, name, description, created_at, updated_at                                            | Project metadata                           |
| `project_entities`    | project_id, neid, name, entity_type, added_at, added_by                                  | Entity list per project                    |
| `project_scores`      | project_id, neid, lens, score, computed_at, agent_session_id                             | Agent-computed risk scores                 |
| `project_assessments` | project_id, neid, severity, justification, assessed_by, assessed_at                      | Human analyst assessments                  |
| `agent_sessions`      | id, project_id, trigger, status, started_at, completed_at                                | Pipeline run audit log                     |
| `agent_traces`        | session_id, agent_type, step, input_summary, output_summary, duration_ms, evidence_count | Per-agent step traces                      |
| `agent_cache`         | project_id, neid, cache_type, data_json, fetched_at, ttl_seconds                         | Cached Context Packages from History Agent |

**User flow:**

1. User creates or selects a project
2. User adds entities by name — the Dialogue Agent resolves names to NEIDs via Elemental
3. Agents automatically begin gathering context for all project entities (History Agent fans out)
4. Data Explorer and Dashboard populate progressively as agents complete their work
5. User can trigger re-scans, ask questions, or set standing instructions

### 3.3 Data Explorer Module — Five Views

All five views show the **same project entities** through different visual lenses. Each view is populated by agent output stored in `agent_cache` and `project_scores`, not by direct Elemental calls from the UI.

#### View 1: Table

A sortable, filterable data table of all project entities.

| Column               | Source                                                    |
| -------------------- | --------------------------------------------------------- |
| Name / Ticker        | Elemental entity facts (via History Agent cache)          |
| Entity Type          | Elemental flavor                                          |
| Solvency Score (FHS) | Query Agent analytical module                             |
| Executive Risk (ERS) | Query Agent analytical module                             |
| Fused Risk Score     | Weighted combination                                      |
| Last Event           | Most recent event from `elemental_get_events`             |
| News Sentiment       | `elemental_graph_sentiment`                               |
| Stock Price / Change | Elemental financial properties                            |
| Data Freshness       | Staleness indicator (days since last filing/event)        |
| Status               | Agent scan status (pending / scanning / complete / stale) |

**Interactions:** Click row to open Entity Modal. Sort by any column. Filter by entity type, risk tier, or freshness. Bulk select for re-scan.

#### View 2: Graph (Network)

A Sigma/Graphology force-directed network visualization.

- **Nodes:** Project entities + their 1-hop relationships (from `elemental_get_related` via History Agent)
- **Edges:** Typed relationships (subsidiary_of, officer_of, trustee_of, issuer_of, etc.)
- **Color coding:** By entity type (organization = blue, person = green, financial_instrument = orange, etc.)
- **Node size:** Proportional to risk score or relationship count
- **Interaction:** Click node to open Entity Modal; hover for tooltip with name + score
- **Layout:** ForceAtlas2 with Louvain community detection
- **Controls:** Zoom, pan, search, filter by relationship type, toggle labels

#### View 3: Entity Modal

A dialog showing a single entity's complete profile, populated from cached agent output.

**Sections:**

1. **Header** — Name, type, identifiers (CIK, NEID, LEI, ticker), risk tier badge
2. **Risk Summary** — FHS + ERS scores with trend sparklines, fused score, agreement/conflict indicator
3. **Key Metrics** — Leverage, coverage, margins (from `historical_properties` via History Agent)
4. **Risk Drivers** — Top 3-5 signals with lens label, one-sentence explanation, evidence citation
5. **Relationships** — Officers, directors, subsidiaries, parent entities (tabulated from `elemental_get_related`)
6. **Recent Events** — From `elemental_get_events`, sorted by date, with category and participant chips
7. **Evidence Panel** — Expandable section with direct links to source filings/articles
8. **Assessment Block** — Severity selector (Critical/High/Watch/Normal), free-text justification, save button

#### View 4: Event Timeline

A vertical timeline of all events across the project's entities, ordered by date.

- **Event cards:** Date, event type icon, entity name, description, participant list
- **Filtering:** By entity, event category, date range
- **Velocity detection:** Visual clustering when 3+ events occur within 14 days (highlighted as "event cluster")
- **Color coding:** By entity (each entity gets a consistent color) or by event category
- **Interaction:** Click event card to open associated entity's modal

#### View 5: Narrative

An agent-generated text view that synthesizes the project's current state into readable prose.

- **Generated by:** Query Agent (analytical reasoning) + Composition Agent (formatting)
- **Structure:**
    - Executive summary (2-3 paragraphs: overall portfolio health, top concerns, notable changes)
    - Per-entity risk briefs (ordered by fused risk score, descending)
    - Cross-entity themes (common risk drivers, sector patterns)
    - Evidence citations (footnotes linking to source material)
- **Controls:** "Generate Narrative" button triggers the full pipeline; loading state with SSE progress
- **Export:** Copy as markdown, print/export as PDF
- **Timestamp:** Shows when narrative was generated and which agent session produced it

### 3.4 Dashboard (Monitor)

The dashboard shows aggregate project analytics against the two core use cases: **Financial Health (Solvency)** and **Executive Risk**.

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│  Project: [name]              Last scan: [timestamp]  │
│  [Scan Now]  [Configure Weights]                      │
├──────────────────────────┬───────────────────────────┤
│  Fused Risk Distribution │  Score Trends (30/90d)    │
│  [histogram by tier:     │  [sparkline grid showing  │
│   Critical/High/Watch/   │   top 10 entities with    │
│   Normal counts]         │   directional arrows]     │
├──────────────────────────┼───────────────────────────┤
│  Solvency Lens (FHS)     │  Executive Risk Lens (ERS)│
│  ─────────────────────   │  ─────────────────────────│
│  Top 5 deteriorating:    │  Top 5 deteriorating:     │
│  1. Entity A  score  ↑   │  1. Entity X  score  ↑    │
│  2. Entity B  score  ↑   │  2. Entity Y  score  →    │
│  ...                     │  ...                      │
│                          │                           │
│  Signal breakdown:       │  Signal breakdown:        │
│  [bar chart of signal    │  [bar chart of signal     │
│   contributions]         │   contributions]          │
├──────────────────────────┴───────────────────────────┤
│  Recent Alerts                                        │
│  [notification cards from Composition Agent,          │
│   showing threshold crossings, new events, etc.]      │
├──────────────────────────────────────────────────────┤
│  Entity Risk Table                                    │
│  [sortable by FHS, ERS, Fused, Name, Type, Freshness]│
└──────────────────────────────────────────────────────┘
```

**FHS Signal Components:**

- Leverage ratio (debt/assets)
- Debt-to-equity ratio
- Interest coverage ratio
- Current ratio
- Operating margin trend
- Equity erosion indicator
- Data staleness decay (730+ days = 0.3x weight)

**ERS Signal Components:**

- Officer departures (recency-weighted: 0-30 days = 1.0x, 1yr+ = 0.4x)
- C-suite premium (CEO departure = 1.5x, CFO = 1.4x multiplier)
- Board composition changes
- Auditor changes
- Cumulative pattern detection (4+ departures in 12 months = "systemic instability" at 1.5x)

**Fused Score:** Default weights FHS 60%, ERS 40%. Configurable via "Configure Weights" dialog with slider controls.

### 3.5 Agents Module

The control surface for the four-agent pipeline.

**Tab 1: Activity Feed**

- Live SSE stream of agent actions (real-time updates as agents work)
- Each activity entry shows: timestamp, agent type icon, entity name, action description, duration
- Color-coded by agent: Dialogue = purple, History = blue, Query = green, Composition = orange
- Auto-scroll with pause button

**Tab 2: Sessions**

- Table of completed pipeline runs
- Columns: session ID, trigger (user/schedule/event), status, entity count, duration, timestamp
- Expand row to see per-agent traces: what each agent did, what it produced, how long it took, how many evidence items

**Tab 3: Configuration**

- Per-agent settings cards:
    - Dialogue Agent: domain priors, clarification threshold, entity resolution confidence minimum
    - History Agent: MCP concurrency limit, default time window, relationship hop depth
    - Query Agent: FHS/ERS weight sliders, severity thresholds, narrative style
    - Composition Agent: output format preferences, notification verbosity

**Tab 4: Dialogue**

- Interactive chat interface routed through the full 4-agent pipeline
- User types a question; system shows each agent's contribution in expandable steps
- Supports follow-up questions (Dialogue Agent maintains conversational state)
- Example queries:
    - "What changed at Delta last week?"
    - "Show me our highest-risk entities"
    - "Why did Entity X's score increase?"
    - "Generate a brief on the top 5 deteriorating names"

---

## 4. Server Architecture

### 4.1 Runtime Stack

Agents run server-side. The browser never calls Elemental MCP directly.

```
Browser (Vue 3 / Vuetify 3)
  ↕ SSE + REST API
Nitro Server (TypeScript API routes)
  ↕ Python subprocess (JSON stdin/stdout)
Python Agent Runtime (Gemini-backed)
  ↕ MCP JSON-RPC (streamable HTTP)
Elemental MCP Server
```

### 4.2 API Endpoints

**Projects:**

| Method | Path                                  | Purpose                                          |
| ------ | ------------------------------------- | ------------------------------------------------ |
| GET    | `/api/v2/projects`                    | List all projects                                |
| POST   | `/api/v2/projects`                    | Create a new project                             |
| GET    | `/api/v2/projects/:id`                | Get project with entity count                    |
| DELETE | `/api/v2/projects/:id`                | Delete a project                                 |
| GET    | `/api/v2/projects/:id/entities`       | List project entities with cached scores         |
| POST   | `/api/v2/projects/:id/entities`       | Add entities (names resolved via Dialogue Agent) |
| DELETE | `/api/v2/projects/:id/entities/:neid` | Remove entity from project                       |
| GET    | `/api/v2/projects/:id/scores`         | Get all scores for project entities              |
| POST   | `/api/v2/projects/:id/assessments`    | Save analyst assessment for an entity            |

**Agent Pipeline:**

| Method | Path                             | Purpose                                              |
| ------ | -------------------------------- | ---------------------------------------------------- |
| POST   | `/api/v2/agents/pipeline`        | Run 4-agent pipeline (single entity or project-wide) |
| POST   | `/api/v2/agents/dialogue`        | Conversational dialogue (maintains session state)    |
| GET    | `/api/v2/agents/activity-stream` | SSE endpoint for live agent activity                 |
| GET    | `/api/v2/agents/sessions`        | List completed pipeline sessions                     |
| GET    | `/api/v2/agents/sessions/:id`    | Get session with traces                              |
| GET    | `/api/v2/agents/config`          | Get agent configuration                              |
| PUT    | `/api/v2/agents/config`          | Update agent configuration                           |

**Data (agent-cached):**

| Method | Path                                              | Purpose                                        |
| ------ | ------------------------------------------------- | ---------------------------------------------- |
| GET    | `/api/v2/projects/:id/entity/:neid/context`       | Get cached Context Package for an entity       |
| GET    | `/api/v2/projects/:id/entity/:neid/events`        | Get cached events for an entity                |
| GET    | `/api/v2/projects/:id/entity/:neid/relationships` | Get cached relationships for an entity         |
| POST   | `/api/v2/projects/:id/narrative`                  | Generate project narrative (triggers pipeline) |
| GET    | `/api/v2/projects/:id/dashboard`                  | Get dashboard aggregate data                   |

### 4.3 Agent Invocation Patterns

| Trigger                            | Pipeline Used                                           | Output Surface                            |
| ---------------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| User loads project                 | History Agent fans out across all entities              | Table + Dashboard populate progressively  |
| User asks question in Dialogue tab | Full 4-agent pipeline                                   | Dialogue response + optional view updates |
| Standing instruction (background)  | Full 4-agent pipeline on schedule                       | Notification / Alert card                 |
| User clicks "Refresh" on entity    | History → Query → Composition for single entity         | Entity Modal update                       |
| User requests narrative            | History → Query → Composition with narrative intent     | Narrative view                            |
| User adds entity to project        | Dialogue (resolve name) → History → Query → Composition | New row in table, graph node              |

### 4.4 Elemental MCP Tool Usage Matrix

| Agent       | MCP Tools                                                                                                                            | Purpose                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Dialogue    | `elemental_get_entity`, `elemental_get_schema`                                                                                       | Resolve ambiguous names to NEIDs; understand available data shape |
| History     | `elemental_get_entity`, `elemental_get_related`, `elemental_get_events`, `elemental_graph_neighborhood`, `elemental_graph_sentiment` | Full context retrieval                                            |
| Query       | None (operates on Context Package)                                                                                                   | Analytical reasoning — no direct MCP access                       |
| Composition | None (formats analytical output)                                                                                                     | Template-driven output — no direct MCP access                     |

---

## 5. Python Agent Implementations

### 5.1 Dialogue Agent (`server/agents/v2/dialogue_agent.py`)

```python
class DialogueAgent:
    """
    Context Interface agent — the 'reference librarian.'
    Resolves ambiguous requests into Structured Retrieval Plans.
    """

    def run(self, request: str, project_entities: list, session_history: list) -> RetrievalPlan:
        # 1. Build system prompt with project entity list and domain priors
        # 2. Send user request + conversation history to Gemini
        # 3. Parse structured output: resolved NEIDs, time window, intent, modules
        # 4. If confidence < threshold, return clarification question instead
        # 5. Return RetrievalPlan
        ...
```

**RetrievalPlan schema:**

```python
@dataclass
class RetrievalPlan:
    resolved_entities: list[ResolvedEntity]  # NEIDs + names
    time_window: TimeWindow                   # start/end dates
    relationship_types: list[str]             # which relationship types to traverse
    modules: list[str]                        # ["fhs", "ers"] — which analytical modules
    intent: str                               # "explore" | "triage" | "monitor" | "brief"
    needs_clarification: bool                 # if True, clarification_question is set
    clarification_question: str | None        # question to ask user
```

### 5.2 History Agent (`server/agents/v2/history_agent.py`)

```python
class HistoryAgent:
    """
    Knowledge Graph retrieval agent.
    Executes retrieval plan against Elemental MCP.
    Deterministic — follows the plan, no generative reasoning.
    """

    def run(self, plan: RetrievalPlan) -> ContextPackage:
        # 1. For each resolved entity, fan out parallel MCP calls:
        #    - elemental_get_entity (facts + historical_properties)
        #    - elemental_get_related (by flavor: organization, person, etc.)
        #    - elemental_get_events (with participants)
        #    - elemental_graph_sentiment (if news signals requested)
        # 2. Normalize all NEIDs (strip leading zeros)
        # 3. Deduplicate entities across results
        # 4. Set data availability flags
        # 5. Return ContextPackage
        ...
```

**ContextPackage schema:**

```python
@dataclass
class ContextPackage:
    entities: dict[str, EntityData]        # keyed by normalized NEID
    relationships: list[Relationship]
    events: list[Event]
    properties: dict[str, list[PropertyPoint]]  # historical property series
    sentiment: dict[str, SentimentData]
    flags: DataFlags                        # has_financial_data, has_governance_data, etc.
    evidence: list[EvidenceCitation]
    retrieval_stats: RetrievalStats         # call counts, durations, cache hits
```

### 5.3 Query Agent (`server/agents/v2/query_agent.py`)

```python
class QueryAgent:
    """
    Analytical reasoning agent.
    Runs FHS/ERS modules over Context Package, produces scores and narratives.
    """

    def run(self, context: ContextPackage, plan: RetrievalPlan, config: AgentConfig) -> AnalyticalResult:
        # 1. For each entity in context:
        #    a. If "fhs" in plan.modules: compute FHS score from financial properties
        #    b. If "ers" in plan.modules: compute ERS score from relationships + events
        #    c. Compute fused score with configured weights
        #    d. Identify top risk drivers with evidence
        #    e. Determine severity tier
        # 2. If plan.intent == "brief": generate narrative via Gemini
        # 3. Detect signal agreement/conflict across lenses
        # 4. Return AnalyticalResult
        ...
```

**AnalyticalResult schema:**

```python
@dataclass
class AnalyticalResult:
    entity_scores: list[EntityScore]       # per-entity: fhs, ers, fused, severity, risk_drivers
    narrative: str | None                   # generated prose (if intent was "brief")
    signal_agreement: str                   # "agreement" | "conflict" | "mixed"
    cross_entity_themes: list[str]          # common patterns across entities
    evidence_chain: list[EvidenceCitation]
```

### 5.4 Composition Agent (`server/agents/v2/composition_agent.py`)

```python
class CompositionAgent:
    """
    Output formatting agent.
    Formats analytical results for the appropriate UI surface.
    Never alters the analysis — only decides presentation.
    """

    def run(self, result: AnalyticalResult, plan: RetrievalPlan) -> list[ComposedOutput]:
        # 1. Based on plan.intent and result contents, determine output formats
        # 2. For each entity score: compose table row update
        # 3. If scores cross thresholds: compose notification card
        # 4. If narrative exists: compose narrative block
        # 5. If new events: compose timeline entries
        # 6. Persist to projects.db (scores, cache)
        # 7. Return list of ComposedOutput for SSE delivery
        ...
```

### 5.5 Pipeline Orchestrator (`server/agents/v2/pipeline.py`)

```python
class AgentPipeline:
    """
    Orchestrates the four-agent pipeline.
    Creates session, runs agents in sequence, records traces.
    """

    def run(self, request: PipelineRequest) -> PipelineResult:
        session = create_session(request.project_id, request.trigger)

        # Step 1: Dialogue Agent
        plan = self.dialogue_agent.run(request.query, request.project_entities, request.history)
        record_trace(session, "dialogue", plan)
        if plan.needs_clarification:
            return PipelineResult(clarification=plan.clarification_question)

        # Step 2: History Agent
        context = self.history_agent.run(plan)
        record_trace(session, "history", context.retrieval_stats)

        # Step 3: Query Agent
        result = self.query_agent.run(context, plan, self.config)
        record_trace(session, "query", result)

        # Step 4: Composition Agent
        outputs = self.composition_agent.run(result, plan)
        record_trace(session, "composition", outputs)

        complete_session(session)
        return PipelineResult(outputs=outputs, session_id=session.id)
```

---

## 6. Technical Stack

| Layer         | Technology                                | Notes                                                                   |
| ------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| Framework     | Nuxt 3 (SPA mode, SSR disabled)           | Same framework as current app                                           |
| UI Library    | Vuetify 3                                 | Lovelace dark theme: sharp corners, neon green (#39FF14), anti-Material |
| Graph Viz     | Sigma v3 + Graphology                     | ForceAtlas2 layout, Louvain community detection                         |
| Charts        | Lightweight SVG or ApexCharts             | For sparklines, histograms, bar charts                                  |
| Server        | Nitro (Nuxt server routes)                | TypeScript API layer                                                    |
| Agent Runtime | Python 3.11+                              | Gemini-backed, subprocess pattern                                       |
| LLM           | Google Gemini                             | Dialogue Agent + Query Agent reasoning                                  |
| Data Source   | Elemental MCP (JSON-RPC, streamable HTTP) | Sole external data source                                               |
| Local State   | SQLite (`projects.db`)                    | Projects, assessments, agent sessions/traces, cache                     |
| Real-time     | SSE (EventSource)                         | Agent activity stream to browser                                        |
| MCP Client    | Existing `elemental_client.py`            | Reuse from current codebase                                             |

### Key Dependencies to Reuse from Current Codebase

| Asset                     | Path                                                         | What to Reuse                |
| ------------------------- | ------------------------------------------------------------ | ---------------------------- |
| Elemental MCP client      | `server/agents/mcp/elemental_client.py`                      | Full client — keep as-is     |
| Module registry pattern   | `composables/useModuleRegistry.ts`                           | Feature module registration  |
| Module plugin             | `plugins/01.module-registry.client.ts`                       | Registration entry point     |
| Vuetify theme             | `nuxt.config.ts` (vuetify section)                           | Full Lovelace brand identity |
| FeatureHeader component   | `components/FeatureHeader.vue`                               | Consistent page headers      |
| DB abstraction            | `server/utils/db.ts`                                         | SQLite/Postgres dual-backend |
| Sigma/Graphology patterns | `features/lovelace-dashboard/components/NetworkGraphTab.vue` | Graph visualization approach |
| SSE pattern               | `server/api/lovelace/agents/activity-stream.get.ts`          | Server-sent events           |

---

## 7. File Structure

```
features/
├── project-loader/
│   ├── index.ts                    # Module definition
│   ├── pages/
│   │   └── index.vue               # Project list + create/select UI
│   └── composables/
│       └── useProjectLoader.ts     # Project CRUD state management
│
├── data-explorer/
│   ├── index.ts                    # Module definition
│   ├── pages/
│   │   └── index.vue               # Five-view container with v-tabs
│   └── components/
│       ├── DataSourceTable.vue     # View 1: Sortable entity table
│       ├── DataSourceGraph.vue     # View 2: Sigma network graph
│       ├── EntityModal.vue         # View 3: Entity profile dialog
│       ├── EventTimeline.vue       # View 4: Vertical event timeline
│       └── NarrativeView.vue       # View 5: Agent-generated narrative
│
├── agent-runtime/
│   ├── index.ts                    # Module definition
│   ├── pages/
│   │   └── index.vue               # Four-tab agent control surface
│   └── components/
│       ├── ActivityFeed.vue        # Tab 1: Live SSE activity stream
│       ├── SessionHistory.vue      # Tab 2: Completed session table
│       ├── AgentConfig.vue         # Tab 3: Per-agent settings
│       └── DialogueChat.vue        # Tab 4: Interactive chat
│
└── risk-dashboard/
    ├── index.ts                    # Module definition
    ├── pages/
    │   └── index.vue               # Dashboard layout
    └── components/
        ├── RiskDistribution.vue    # Histogram/heatmap by tier
        ├── ScoreTrends.vue         # Sparkline grid
        ├── LensPanel.vue           # FHS or ERS breakdown panel
        ├── AlertFeed.vue           # Recent notification cards
        └── RiskTable.vue           # Sortable entity risk table

server/
├── agents/v2/
│   ├── __init__.py
│   ├── pipeline.py                 # Pipeline orchestrator
│   ├── dialogue_agent.py           # Agent 1: Context Interface
│   ├── history_agent.py            # Agent 2: KG Retrieval
│   ├── query_agent.py              # Agent 3: Analytical Reasoning
│   └── composition_agent.py        # Agent 4: Output Formatting
│
├── api/lovelace/v2/
│   ├── projects/
│   │   ├── index.get.ts            # List projects
│   │   ├── index.post.ts           # Create project
│   │   ├── [id].get.ts             # Get project
│   │   ├── [id].delete.ts          # Delete project
│   │   └── [id]/
│   │       ├── entities.get.ts     # List entities with scores
│   │       ├── entities.post.ts    # Add entities (name resolution)
│   │       ├── scores.get.ts       # Get scores
│   │       ├── assessments.post.ts # Save assessment
│   │       ├── narrative.post.ts   # Generate narrative
│   │       ├── dashboard.get.ts    # Dashboard aggregates
│   │       └── entity/
│   │           └── [neid]/
│   │               ├── context.get.ts       # Cached context package
│   │               ├── events.get.ts        # Cached events
│   │               └── relationships.get.ts # Cached relationships
│   └── agents/
│       ├── pipeline.post.ts        # Run 4-agent pipeline
│       ├── dialogue.post.ts        # Conversational dialogue
│       ├── activity-stream.get.ts  # SSE live activity
│       ├── sessions.get.ts         # List sessions
│       ├── sessions/
│       │   └── [id].get.ts         # Session with traces
│       ├── config.get.ts           # Agent config
│       └── config.put.ts           # Update agent config
│
└── utils/
    └── agent-projects-db.ts        # projects.db schema + helpers
```

---

## 8. Build Phases

### Phase 1: Foundation (This PRD)

- Project loading (create, add entities via name resolution through Elemental)
- Four-agent pipeline with single-entity and project-wide invocation
- Data Explorer module with 5 views (Table, Graph, Modal, Timeline, Narrative)
- Dashboard with FHS + ERS scores and alert feed
- Agent control surface with activity feed, sessions, config, dialogue

### Phase 2: Standing Instructions + Monitoring

- Background agent loop with configurable schedules (1hr, 4hr, daily)
- Threshold-based alerting (user-defined rules: "alert on leverage > 5x")
- Score trend tracking over time (score_history table, sparkline trends)
- Stale-scan detection (re-scan entities when cached data exceeds TTL)

### Phase 3: Additional Analytical Modules

- Blast Radius (network propagation — how one entity's distress impacts related entities)
- Event Pressure (velocity detection — 3+ events in 14 days = crisis cluster)
- Adversarial Capital Screening (ACS — sanctions proximity via ownership graph traversal)

### Phase 4: Solution Packs

- Configurable module combinations per use case (EDD, KYC, Portfolio Risk, Private Wealth)
- Export artifacts (PDF reports, PowerPoint leave-behinds, CSV data export)
- Solution Pack templates with pre-configured agent instructions and module weights

---

## 9. Success Criteria

### Demo-Ready (Phase 1 Complete)

- [ ] User can create a project and add 5-10 entities by name
- [ ] Dialogue Agent correctly resolves entity names to Elemental NEIDs
- [ ] History Agent retrieves context for all entities from Elemental MCP
- [ ] Query Agent produces FHS and ERS scores for entities with financial/governance data
- [ ] All 5 Data Explorer views render agent-gathered data
- [ ] Dashboard shows risk distribution, top deteriorating entities, and alert feed
- [ ] Agent activity feed streams live updates via SSE
- [ ] Dialogue chat answers questions about project entities with evidence
- [ ] End-to-end pipeline completes in under 60 seconds for a 10-entity project

### Customer-Ready (Phase 2+)

- [ ] Standing instructions monitor entities on schedule without user interaction
- [ ] Threshold alerts surface only when material changes occur
- [ ] Score trends show deterioration over time with sparkline visualization
- [ ] Narrative export produces a defensible, evidence-backed PDF report
