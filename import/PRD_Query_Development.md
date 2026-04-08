# PRD: Query Development Pipeline

**Product**: Signal From the Noise — Foresight Intelligence Platform  
**Author**: System Documentation  
**Date**: 2026-04-07  
**Status**: Living Document

---

## 1. Overview

The platform develops search queries through **three distinct pathways**, each serving a different stage of the intelligence lifecycle:

| Pathway                    | Trigger                              | Model                  | Output                   |
| -------------------------- | ------------------------------------ | ---------------------- | ------------------------ |
| **Research Planner**       | User starts a new research run       | Gemini 3.1 Pro Preview | 18–25 structured queries |
| **Daily Search Generator** | Scheduled cron / manual trigger      | Gemini 2.5 Flash       | 3 queries per config     |
| **Manual Templates**       | User-defined via Daily Search Config | None (static)          | User-authored queries    |

---

## 2. Pathway 1 — Research Planner (Ad-Hoc Runs)

### 2.1 Entry Point

The user submits a research topic (e.g., _"Future of autonomous weapons"_) along with optional parameters:

- **Context**: Additional framing (e.g., _"Focus on non-state actors"_)
- **Geography**: Regional filter (e.g., _"Southeast Asia"_)
- **Time Horizon**: Temporal scope (e.g., _"2025–2030"_)
- **Source Preferences**: Preferred source types (e.g., `["academic_journal", "fringe_community"]`)

**Edge Function**: `research-planner`

### 2.2 Content Moderation Gate

Before any query generation, the topic passes through a **fast moderation check** using `gemini-2.5-flash-lite` (temperature 0). The classifier uses structured function calling to return `{ allowed: boolean, reason: string }`.

- **Allowed**: Any legitimate business, market, technology, or societal research — including controversial industries (adult platforms, weapons, cannabis, surveillance tech).
- **Blocked**: Sexually explicit content, hate speech, instructions for illegal activities, zero-research-merit queries.
- **Fail-open**: If the moderation call itself fails (e.g., rate limit), the topic is allowed through.

### 2.3 Query Generation via LLM

The planner calls **Gemini 3.1 Pro Preview** (temperature 0.3) with a system prompt that frames the AI as a _"futures research planner specializing in weak signal detection AND competitive landscape mapping."_

The LLM returns a structured research plan via **function calling** (not free-text parsing):

```json
{
    "topic_summary": "Refined 1-2 sentence description",
    "subthemes": ["5-8 subthemes"],
    "adjacent_domains": ["3-5 adjacent fields"],
    "keywords": ["15-25 keywords"],
    "signal_hypotheses": ["5-8 hypotheses"],
    "target_entities": ["8-12 organizations/people"],
    "source_categories": ["ordered source types"],
    "search_queries": ["18-25 search queries"]
}
```

### 2.4 Query Composition Rules

The system prompt enforces the following **mandatory query distribution**:

| Category                             | Minimum Count | Example Patterns                                                  |
| ------------------------------------ | ------------- | ----------------------------------------------------------------- |
| Startup targeting                    | 4             | `"[topic] seed funding series A 2025"`                            |
| Market maps / competitive landscapes | 3             | `"market map [topic]"`, `"companies working on [topic]"`          |
| VC / accelerator targeting           | 2+            | Queries mentioning Y Combinator, a16z, Lux Capital, Sequoia, etc. |
| Specific technologies                | 2+            | `"[technology] breakthrough [topic]"`                             |
| Academic / research                  | 2+            | `"[topic] research paper preprint"`                               |
| Fringe / edge communities            | 2+            | `"[topic] Reddit Discord experimental"`                           |

**Key design principle**: _"Focus on the EDGES — fringe communities, experimental projects, unusual policy moves, unexpected actors, emerging behaviors. Not mainstream news."_

### 2.5 Downstream Flow

```
User Topic → Moderation Gate → Research Planner (LLM)
  → 18-25 queries
    → Firecrawl Search (8 results/query, batches of 3)
      → Signal Extractor (Gemini 2.5 Pro, 10-14 findings/batch)
        → Persist to `signals` + `signal_entities` tables
```

Queries are stored in `research_runs.research_plan` as JSON for traceability. They are executed by `firecrawl-search`, which parallelizes in batches of 3 with 500ms inter-batch delays.

---

## 3. Pathway 2 — Daily Search (Automated Monitoring)

### 3.1 Configuration

Users configure monitoring targets via the `daily_search_config` table:

| Field                 | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `target_type`         | `"theme"` or `"company"`                               |
| `target_name`         | Human-readable name (e.g., _"AI Agent Orchestration"_) |
| `query_templates`     | Optional: user-authored static queries                 |
| `max_queries_per_run` | Cap per config (default 3)                             |
| `frequency`           | `"daily"`, `"twice_daily"`, or `"weekly"`              |
| `is_active`           | Toggle on/off                                          |

### 3.2 Query Generation Logic

The daily search function follows a **three-tier fallback**:

1. **Static templates** (if `query_templates` is non-empty): Use user-authored queries directly, capped at `max_queries_per_run`.
2. **LLM generation** (if templates are empty and `GOOGLE_GEMINI_API_KEY` is set): Call **Gemini 2.5 Flash** (temperature 0.3) with a simple prompt:
    - For themes: _"Generate 3 web search queries to find new developments about: '[target_name]'"_
    - For companies: _"Generate 3 web search queries for recent news about the company '[target_name]'"_
    - Response is parsed as a JSON array of strings from the LLM's free-text output.
3. **Fallback** (if both above fail): A single generic query: `"[target_name] latest news developments"`.

### 3.3 Deduplication

Before passing results to signal extraction, the daily search performs **URL-based deduplication** against existing signals in the database. This prevents re-ingesting articles that were already processed in a prior run.

### 3.4 Execution

```
pg_cron trigger (or manual) → daily-search function
  → For each active config:
    → Generate 3 queries (LLM or template)
    → Firecrawl search (5 results/query)
    → URL dedup against existing signals
    → Signal extraction (if new content found)
    → 2s delay before next config
```

Results are logged in `daily_search_runs` with metrics: `configs_processed`, `queries_executed`, `signals_found`, `signals_deduplicated`.

---

## 4. Pathway 3 — Theme Pipeline (Seed-Biased Clustering)

### 4.1 Theme Seeds

Users can define **theme seeds** (`theme_seeds` table) that bias the clustering algorithm toward specific topics of interest:

| Field         | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | Seed name (e.g., _"Agent Economy"_)                                     |
| `description` | What to look for                                                        |
| `keywords`    | Array of matching terms (e.g., `["agent", "agentic", "orchestration"]`) |
| `is_active`   | Toggle                                                                  |

### 4.2 How Seeds Influence Query-Adjacent Logic

While theme seeds don't generate search queries directly, they influence the **structural pre-clustering** step by assigning a **weight of 6** (the highest in the system) to signal-entity pairs that match seed keywords. This ensures that signals related to seeded topics cluster together even if they share few entity overlaps otherwise.

The clustering weights hierarchy:

1. **Seed keyword match**: weight 6
2. **Entity co-occurrence**: weight 3
3. **Tag overlap**: weight 2
4. **Run co-occurrence**: weight 1

---

## 5. Search Execution Layer (Firecrawl)

All query pathways ultimately execute through the **firecrawl-search** edge function, which wraps the Firecrawl API:

| Parameter         | Research Runs      | Daily Search       |
| ----------------- | ------------------ | ------------------ |
| Results per query | 8                  | 5                  |
| Batch size        | 3 concurrent       | 3 concurrent       |
| Inter-batch delay | 500ms              | 500ms              |
| Content cap       | 3,000 chars/result | 3,000 chars/result |
| Output format     | Markdown           | Markdown           |

### 5.1 Rate Limit Handling

- **402 (credits exhausted)**: Immediately halts and returns error to caller.
- **Other failures**: Logs error, returns empty results for that query, continues with remaining queries.

---

## 6. Quality Controls on Query Output

### 6.1 Signal Extraction Quality

Queries feed into the **signal-extractor** (Gemini 2.5 Pro), which applies its own quality filters:

- Content context capped at 35,000 characters
- Minimum 200 chars of real content required before extraction proceeds
- Each signal requires verbatim evidence snippets (≥80 chars)
- Cross-validated source URLs

### 6.2 Theme Quality Floor (Post-Query)

After signals are clustered into themes, a quality floor rejects themes where:

- `confidence < 40`
- `run_diversity_count < 2` (echo chamber detection)
- Theme name is too generic (< 4 words)

### 6.3 Topic Proportionality Cap

Any single topic is capped at **3 clusters maximum** to prevent dominant entities from monopolizing the theme space.

---

## 7. Data Flow Diagram

```
┌──────────────────────────────────────────────────────┐
│                    USER INPUTS                        │
├──────────────┬──────────────┬─────────────────────────┤
│ Research Run │ Daily Config │ Theme Seed              │
│ (topic +     │ (target +    │ (keywords +             │
│  context)    │  templates)  │  description)           │
└──────┬───────┴──────┬───────┴─────────┬───────────────┘
       │              │                 │
       ▼              ▼                 │
  ┌─────────┐  ┌────────────┐          │
  │Moderation│  │ Template   │          │
  │  Gate    │  │ or LLM     │          │
  └────┬─────┘  │ fallback   │          │
       │        └─────┬──────┘          │
       ▼              ▼                 │
  ┌─────────┐  ┌────────────┐          │
  │ Gemini   │  │ Gemini     │          │
  │ 3.1 Pro  │  │ 2.5 Flash  │          │
  │ 18-25 q  │  │ 3 queries  │          │
  └────┬─────┘  └─────┬──────┘          │
       │              │                 │
       ▼              ▼                 │
  ┌────────────────────────┐            │
  │   Firecrawl Search     │            │
  │  (batches of 3, 500ms) │            │
  └──────────┬─────────────┘            │
             │                          │
             ▼                          │
  ┌────────────────────────┐            │
  │  Signal Extractor      │            │
  │  (Gemini 2.5 Pro)      │            │
  └──────────┬─────────────┘            │
             │                          │
             ▼                          ▼
  ┌────────────────────────────────────────┐
  │         Theme Pipeline                  │
  │  (clustering + seed weighting +         │
  │   proportionality cap + quality floor)  │
  └─────────────────────────────────────────┘
```

---

## 8. Model Selection Rationale

| Stage                | Model                  | Why                                                                               |
| -------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| Moderation           | Gemini 2.5 Flash Lite  | Cheapest, fastest. Binary classification only.                                    |
| Research Planning    | Gemini 3.1 Pro Preview | Highest reasoning quality for decomposing complex topics into diverse query sets. |
| Daily Query Gen      | Gemini 2.5 Flash       | Good balance of cost/quality for simple 3-query generation.                       |
| Signal Extraction    | Gemini 2.5 Pro         | Best at structured data extraction from long documents.                           |
| Theme Interpretation | Gemini 2.5 Flash       | Sufficient for cluster → theme labeling at scale.                                 |

---

## 9. Known Limitations & Future Work

1. **No query feedback loop**: Queries that yield zero results don't inform future query generation. A future iteration could track query→signal yield and prune low-performing query patterns.
2. **No temporal recency bias**: Queries don't automatically append date filters. Adding `"2025 2026"` to daily search queries would reduce stale results.
3. **No cross-run dedup of queries**: The same research topic run twice generates similar queries. A query fingerprint cache could prevent redundant searches.
4. **Seed-to-query bridge**: Theme seeds currently only influence clustering weights, not query generation. A future enhancement could auto-generate daily search configs from active seeds.
5. **Language bias**: All queries are generated in English. Multi-lingual query generation would surface non-anglophone weak signals.
