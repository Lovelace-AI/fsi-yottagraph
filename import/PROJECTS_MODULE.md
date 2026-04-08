# Projects Module — Product Requirements Document

**Created:** 2026-04-07
**Author:** Lovelace AI
**Status:** Draft
**App ID:** my-dserp-fsi

---

## 1. Product Vision

### What We're Building

The **Projects Module** is the entry point and organizational backbone of the FSI Credit Monitor. It provides a structured workflow for analysts to build, populate, and resolve entity lists that feed every downstream module — Studio, Monitor, Dashboard, Document Graph, and the agent pipeline.

A project is a named collection of entities that an analyst intends to monitor, analyze, or assess. The Projects Module handles three concerns:

1. **Entity Ingestion** — Getting entities into the project via CSV upload, individual addition, or Gemini-powered research queries.
2. **Entity Resolution** — Matching ingested names/identifiers to canonical records in the reference graph (entities.db) and Elemental MCP, confirming hard identifiers (CIK, NEID, LEI, ticker, FIGI, CUSIP, EIN) and data availability.
3. **Project Management** — Creating, switching, renaming, deleting, and inspecting projects.

### Why This Matters

Every analytical workflow in the application begins with "which entities am I looking at?" If entity resolution is incomplete or wrong, downstream scoring (FHS, ERS, Event Pressure, Blast Radius) will be inaccurate or missing. The Projects Module is the quality gate that ensures analysts start from a clean, well-resolved entity list before any analysis runs.

### Design Principles

1. **Resolution Confidence is Visible** — The analyst always knows which entities resolved, which didn't, and how strong the match is (identifier coverage, match method, confidence score).
2. **Multiple Ingestion Paths, Same Resolution Pipeline** — Whether entities come from CSV, manual entry, or Gemini research, they all pass through the same resolution and confirmation flow.
3. **Hard IDs First** — Resolution prioritizes deterministic identifier matching (CIK, ticker, CUSIP, FIGI, LEI, EIN) over fuzzy name matching. When fuzzy matching is used, confidence is surfaced explicitly.
4. **Progressive Resolution** — Entities can be added before resolution is complete. Resolution can be triggered manually, in bulk, or run automatically in the background.
5. **Non-Destructive** — Unresolved entities are kept in the project (not discarded). The analyst can re-resolve, manually assign identifiers, or leave them as-is.

---

## 2. Entity Ingestion

Three paths for getting entities into a project. All three produce the same intermediate representation: a list of `ProjectEntity` records with whatever identifiers the source provides.

### 2.1 CSV Upload

The primary bulk ingestion path. Analyst uploads a CSV file or pastes CSV text containing entity names and optional identifiers.

**Flow:**

```
Upload/Paste CSV
      │
      ▼
Parse Headers → Auto-Detect Column Mapping
      │
      ▼
Column Mapping UI (analyst confirms/adjusts)
      │         ┌─────────────────────────┐
      │         │  Mappable Fields:       │
      │         │  - Company Name         │
      │         │  - CIK                  │
      │         │  - Ticker               │
      │         │  - CUSIP                │
      │         │  - ISIN                 │
      │         │  - FIGI                 │
      │         │  - LEI                  │
      │         │  - EIN                  │
      │         │  - Address              │
      │         │  - (Ignore)             │
      │         └─────────────────────────┘
      ▼
Optional: Toggle OpenFIGI enrichment
      │
      ▼
"Resolve N Entities" → Resolution Pipeline (§3)
      │
      ▼
Preview: Match results table with confidence/method
      │
      ▼
Optional: Assign entity types for unmatched
      │
      ▼
Optional: Resolve identifier conflicts (existing vs OpenFIGI)
      │
      ▼
"Import N Entities" → Write to project_entities
```

**Column Auto-Detection:** Headers containing `cik`, `ticker`/`symbol`, `figi`, `cusip`, `isin`, `lei`, `ein`, `name`/`company`/`entity`, or `address` are automatically mapped. Analyst can override any mapping.

**CSV Parsing:** RFC 4180 compliant — handles quoted fields with commas (`"Block, Inc.",XYZ`), escaped quotes (`"Say ""Hello"""`), and mixed quoting.

**Batch Import:** For large files (>50 entities), import proceeds in batches of 50 with a progress bar showing `current / total` and the current stage.

### 2.2 Individual Entity Addition

For ad-hoc additions — adding a single entity by name, ticker, or CIK.

**Flow:**

```
Search bar: "Search by name, CIK, or ticker"
      │
      ▼
Search entities.db (organizations + persons)
      │         ┌─────────────────────────┐
      │         │  Detection patterns:    │
      │         │  - 10-digit → CIK       │
      │         │  - 1-5 uppercase → ticker│
      │         │  - Otherwise → name     │
      │         └─────────────────────────┘
      ▼
Results list with checkboxes
      │
      ▼
Select entities → "Add N Entities"
      │
      ▼
Write to project_entities (already resolved)
```

**Key Behavior:** Because individual search queries against `entities.db`, matched results already have hard identifiers (CIK, ticker, NEID, etc.). These entities skip the resolution pipeline and are inserted as pre-resolved.

### 2.3 Gemini Research Query

For discovery-driven ingestion — the analyst describes a set of entities in natural language and Gemini produces a candidate list.

**Flow:**

```
Research prompt input:
"Top 20 regional banks in the Southeast by total assets"
"Companies with recent CFO departures in the healthcare sector"
"S&P 500 constituents with leverage ratio above 5x"
      │
      ▼
Gemini generates structured entity list
      │         ┌─────────────────────────────────────┐
      │         │  Gemini Output Schema:              │
      │         │  {                                   │
      │         │    entities: [                       │
      │         │      {                               │
      │         │        name: "Regions Financial",    │
      │         │        ticker: "RF",                 │
      │         │        rationale: "4th largest       │
      │         │          regional bank in SE US      │
      │         │          by total assets ($156B)"    │
      │         │      },                              │
      │         │      ...                             │
      │         │    ],                                │
      │         │    query_interpretation: "...",       │
      │         │    total_candidates: 20,              │
      │         │    coverage_notes: "..."              │
      │         │  }                                    │
      │         └─────────────────────────────────────┘
      ▼
Candidate Review UI:
  - Entity name + ticker + rationale
  - Select/deselect individual entities
  - "Select All" / "Deselect All"
      │
      ▼
"Add N Entities" → Resolution Pipeline (§3)
      │
      ▼
Preview: Match results with confidence
      │
      ▼
Confirm → Write to project_entities
```

**Gemini Prompt Design:**

The system prompt instructs Gemini to:

- Return entities as structured JSON (not prose)
- Include at least one hard identifier per entity when possible (ticker is most common from Gemini's training data)
- Provide a one-sentence `rationale` explaining why each entity matches the query
- Flag when coverage is incomplete or the query is ambiguous
- Respect entity counts if specified ("top 20" → exactly 20)
- Prefer publicly-traded entities when the query doesn't specify (these are easier to resolve)

**Research Query Templates:** Pre-built prompts for common use cases:

| Template           | Prompt                                           |
| ------------------ | ------------------------------------------------ |
| Sector Scan        | "Top N companies in [sector] by [metric]"        |
| Risk Screen        | "Companies with [risk indicator] in [timeframe]" |
| Peer Group         | "Direct competitors of [company] in [geography]" |
| Index Constituents | "[Index name] constituents as of [date]"         |
| Event-Driven       | "Companies affected by [event/regulation]"       |

**Error Handling:**

- If Gemini returns no entities: show message "No entities found for this query. Try rephrasing or broadening the search."
- If Gemini returns entities without identifiers: entities proceed to resolution pipeline with name-only matching (lower confidence expected).
- If Gemini request fails (rate limit, network): show retry button with error message.

---

## 3. Entity Resolution Pipeline

All ingested entities — regardless of source — pass through the resolution pipeline. The pipeline attempts to match each entity to canonical records and populate hard identifiers.

### 3.1 Resolution Strategy (Ordered by Priority)

```
Input Entity (name, ticker, CIK, CUSIP, etc.)
      │
      ├─ 1. Hard ID Match (deterministic, highest confidence)
      │     CIK → entities.db/organizations WHERE cik = ?
      │     Ticker → entities.db/organizations WHERE ticker = ?
      │     CUSIP → entities.db via entity_id_lookup
      │     FIGI → entities.db via entity_id_lookup
      │     LEI → entities.db/organizations WHERE lei = ?
      │     EIN → entities.db/organizations WHERE ein = ?
      │
      ├─ 2. OpenFIGI API (optional, for CUSIP/ISIN/ticker enrichment)
      │     CUSIP → OpenFIGI → FIGI + composite_figi + security metadata
      │     ISIN → OpenFIGI → FIGI + composite_figi + issuer
      │     Ticker → OpenFIGI → FIGI + CUSIP
      │
      ├─ 3. Elemental MCP (NEID resolution)
      │     Name → elemental_get_entity → NEID
      │     Name variants tried:
      │       - Raw name
      │       - Without share class suffix (-CL A, CLASS B, etc.)
      │       - Without legal suffix (INC, CORP, LLC, etc.)
      │
      ├─ 4. Fuzzy Name Match (lowest confidence)
      │     Name → entities.db WHERE UPPER(name) LIKE UPPER(?)
      │     Name → news.db/list_members WHERE UPPER(entity_name) LIKE ?
      │
      └─ 5. Unresolved
            Entity retained in project with available identifiers
            Flagged for manual review
```

### 3.2 Resolution Output Per Entity

Each entity gets a resolution result with:

| Field                  | Type        | Description                                                                                                  |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `matched`              | boolean     | Whether the entity resolved to a canonical record                                                            |
| `matched_entity`       | object      | The canonical record (name, CIK, ticker, NEID, LEI, etc.)                                                    |
| `confidence`           | float (0-1) | Match confidence (1.0 for hard ID match, lower for fuzzy)                                                    |
| `match_method`         | string      | How the match was made: `cik`, `ticker`, `figi`, `cusip`, `lei`, `ein`, `name_fuzzy`, `cusip_openfigi`, etc. |
| `resolution_strength`  | int (0-8)   | Count of populated hard identifiers (CIK, ticker, FIGI, CUSIP, ISIN, LEI, EIN, NEID)                         |
| `identifier_profile`   | object      | Boolean map of which identifiers are available                                                               |
| `identifier_conflicts` | array       | Conflicts between existing data and OpenFIGI data (if enrichment enabled)                                    |

### 3.3 Identifier Coverage Summary

After resolution completes, the UI shows an aggregate coverage view:

```
┌────────────────────────────────────────────────────┐
│  42 / 50 entities matched (84%)                     │
│                                                      │
│  Identifier Coverage:                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ CIK  │ │TICKER│ │ NEID │ │ FIGI │ │ LEI  │      │
│  │ 92%  │ │ 88%  │ │ 76%  │ │ 64%  │ │ 42%  │      │
│  │  ✓   │ │  ✓   │ │  ◐   │ │  ◐   │ │  ○   │      │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘      │
│                                                      │
│  Avg Resolution Strength: 4.2 IDs/entity             │
│  8 unmatched → will create as new entities           │
└────────────────────────────────────────────────────┘
```

### 3.4 Data Availability Flags

Beyond identifier resolution, the system checks what data sources are available for each entity:

| Flag               | Source              | Check                                        |
| ------------------ | ------------------- | -------------------------------------------- |
| `edgar_verified`   | entities.db         | CIK exists in organizations table            |
| `news_verified`    | entities.db + MCP   | NEID resolved (via entities.db or Elemental) |
| `stock_verified`   | news.db             | Ticker found in stock_quotes table           |
| `polymarket_links` | news.db             | Count of entity_market_links for NEID/CIK    |
| `lei_verified`     | entities.db         | LEI field populated                          |
| `sanctions_status` | sanctions screening | `clear`, `match`, or `pending`               |

These flags determine which downstream modules can operate on the entity. An entity without `edgar_verified` won't produce FHS scores. An entity without `news_verified` won't have sentiment data.

### 3.5 Post-Resolution Actions

After initial resolution, the analyst can:

| Action                  | When to Use                                                | Endpoint                                                                 |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Re-resolve All**      | After adding new data sources or fixing entity names       | `POST /projects/:id/entities/resolve` with `resolve_all: true`           |
| **Re-resolve Selected** | Fix resolution for specific entities                       | `POST /projects/:id/entities/resolve` with `entity_ids: [...]`           |
| **Reset NEIDs**         | When NEID mappings are stale and need fresh MCP lookup     | `POST /projects/:id/entities/resolve` with `reset_neids: true`           |
| **MCP-Only Refresh**    | Re-run Elemental MCP resolution without touching other IDs | `POST /projects/:id/entities/resolve` with `mcp_neid_refresh_only: true` |
| **Manual Edit**         | Analyst directly sets CIK/ticker/NEID for an entity        | `PATCH /projects/:id/entities/:id`                                       |
| **Enrich via LEI**      | Bulk-resolve LEI identifiers for entities missing them     | `POST /projects/:id/entities/enrich-lei`                                 |
| **Screen Sanctions**    | Run all entities against sanctions lists                   | `POST /projects/:id/entities/screen-sanctions`                           |

---

## 4. Project Management

### 4.1 Data Model (`projects.db`)

| Table                | Key Columns                                                                                                                                               | Purpose                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `projects`           | id (UUID), name, description, source_collection_id, created_at, updated_at                                                                                | Project metadata                                      |
| `project_entities`   | id, project_id, entity_name, cik, ticker, neid, lei, ein, figi, cusip, entity_type, match_method, entities_db_id, entities_db_type, source_type, added_at | Entity list per project with all resolved identifiers |
| `entity_assessments` | project_id, entity_cik, severity, fused_score, solvency_score, executive_score, event_pressure, blast_radius, justification                               | Analyst assessments (from Studio)                     |
| `event_assessments`  | project_id, event_id, severity, justification                                                                                                             | Event severity overrides                              |

### 4.2 Project CRUD

| Operation          | API                                 | Behavior                                                                |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------- |
| **List Projects**  | `GET /api/lovelace/projects`        | Returns all projects with entity_count, relationship_count, event_count |
| **Create Project** | `POST /api/lovelace/projects`       | Creates empty project with name + optional description                  |
| **Get Project**    | `GET /api/lovelace/projects/:id`    | Returns project metadata with counts                                    |
| **Rename Project** | `PATCH /api/lovelace/projects/:id`  | Updates name and/or description                                         |
| **Delete Project** | `DELETE /api/lovelace/projects/:id` | Deletes project and all associated entities, assessments, events        |
| **Seed Demo**      | `POST /api/lovelace/projects/seed`  | Creates default "portfolio mgmt (demo)" project if none exist           |

### 4.3 Project Switching

When the analyst switches projects:

1. Clear stale entities, relationships, and events from reactive state (prevents wrong-project data flash)
2. Update `currentProjectId` in reactive state and `localStorage`
3. Fetch new project's entities (base fields first, enrichment hydrated in background)
4. Fetch relationships and events if the project has them (non-blocking)
5. Downstream watchers in Studio/Monitor auto-recalculate when entities arrive

### 4.4 Project Sources

Entities can enter a project from multiple sources, tracked via `source_type`:

| Source Type       | How It Works                              |
| ----------------- | ----------------------------------------- |
| `manual`          | Individual entity addition via search     |
| `csv`             | CSV upload/paste                          |
| `seed`            | Auto-seeded demo project                  |
| `document_graph`  | Imported from a Document Graph collection |
| `news_list`       | Imported from a News List                 |
| `gemini_research` | Generated by Gemini research query        |

---

## 5. UI Components

### 5.1 Project Selector (AppHeader)

Global project selector in the app header. Always visible. Shows current project name with a dropdown to switch.

```
┌──────────────────────────────────────────────────────────────┐
│  [≡]  FSI Credit Monitor    Project: [▼ Portfolio Mgmt Demo] │
│                              42 entities · Last updated 2h    │
└──────────────────────────────────────────────────────────────┘
```

**Dropdown contents:**

- List of all projects with entity counts
- "Create New Project" button at bottom
- Current project highlighted

### 5.2 Create Project Dialog

Wizard-style dialog with three entity source options:

```
┌─────────────────────────────────────────┐
│  Create New Project                      │
│                                          │
│  Name: [________________________]        │
│  Description: [_________________]        │
│                                          │
│  How would you like to add entities?     │
│                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │  Empty  │ │ Upload  │ │ Search  │   │
│  │  List   │ │  CSV    │ │         │   │
│  │  📝     │ │  📤     │ │  🔍     │   │
│  └─────────┘ └─────────┘ └─────────┘   │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │  Gemini Research               │    │
│  │  "Describe the entities you    │    │
│  │   want to research..."        │    │
│  │  🤖                            │    │
│  └─────────────────────────────────┘    │
│                                          │
│            [Cancel]  [Create / Next]     │
└─────────────────────────────────────────┘
```

### 5.3 CSV Upload Dialog

Multi-step dialog: Upload → Column Mapping → Resolution Preview → Entity Type Assignment → Conflict Resolution → Import.

See §2.1 for the full flow. The dialog supports both modal and inline rendering (for embedding in other views).

### 5.4 Gemini Research Panel

Text input with template suggestions and a results review table.

```
┌─────────────────────────────────────────────────────┐
│  Research Query                                      │
│                                                      │
│  [Describe the entities you want to find...       ] │
│                                                      │
│  Templates: [Sector Scan] [Risk Screen] [Peer Group] │
│             [Index Constituents] [Event-Driven]      │
│                                                      │
│  [🔍 Run Research]                                   │
│                                                      │
│  ─────────────────────────────────────────────────── │
│                                                      │
│  Results (20 entities found):                        │
│                                                      │
│  ☑ Regions Financial (RF)                           │
│    "4th largest regional bank in SE US by assets"   │
│  ☑ Synovus Financial (SNV)                          │
│    "Major SE regional bank, HQ in Columbus, GA"    │
│  ☐ Atlantic Capital Group                           │
│    "Atlanta-based commercial bank, acquired 2022"  │
│  ...                                                 │
│                                                      │
│  [Select All]  [Deselect All]                       │
│                                                      │
│            [Cancel]  [Add 18 Entities & Resolve]    │
└─────────────────────────────────────────────────────┘
```

### 5.5 Resolution Status View

Inline panel (or dialog) showing the resolution status of all entities in the current project.

```
┌─────────────────────────────────────────────────────────────┐
│  Entity Resolution Status                                    │
│                                                              │
│  42/50 resolved (84%)  ████████████████░░░  Avg: 4.2 IDs    │
│                                                              │
│  [Re-Resolve All]  [MCP Refresh]  [Screen Sanctions]        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Name            │ CIK  │ Ticker │ NEID │ Method     │   │
│  │─────────────────┼──────┼────────┼──────┼────────────│   │
│  │ Apple Inc       │ ✓    │ AAPL   │ ✓    │ CIK       │   │
│  │ Delta Air Lines │ ✓    │ DAL    │ ✓    │ Ticker    │   │
│  │ Acme Holdings   │ —    │ —      │ —    │ Unmatched │   │
│  │ JPMorgan Chase  │ ✓    │ JPM    │ ✓    │ Name      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. API Endpoints

### 6.1 Project CRUD

| Method | Path                          | Purpose                                                 |
| ------ | ----------------------------- | ------------------------------------------------------- |
| GET    | `/api/lovelace/projects`      | List all projects with entity/relationship/event counts |
| POST   | `/api/lovelace/projects`      | Create new project (body: `{ name, description }`)      |
| GET    | `/api/lovelace/projects/:id`  | Get project metadata                                    |
| PATCH  | `/api/lovelace/projects/:id`  | Update project name/description                         |
| DELETE | `/api/lovelace/projects/:id`  | Delete project and all associated data                  |
| POST   | `/api/lovelace/projects/seed` | Seed demo project if DB is empty                        |

### 6.2 Entity Management

| Method | Path                                       | Purpose                                                |
| ------ | ------------------------------------------ | ------------------------------------------------------ |
| GET    | `/api/lovelace/projects/:id/entities`      | List entities with optional enrichment and assessments |
| POST   | `/api/lovelace/projects/:id/entities`      | Add entity or batch of entities                        |
| PATCH  | `/api/lovelace/projects/:id/entities/:eid` | Update entity identifiers manually                     |
| DELETE | `/api/lovelace/projects/:id/entities/:eid` | Remove entity from project                             |

**Query Parameters for GET entities:**

- `include_assessments=true` — Join assessment data (severity, scores, justification)
- `include_enrichment=true` — Join enrichment data (stock prices, news stats, edgar stats) — heavier query, hydrated in background

### 6.3 Resolution & Enrichment

| Method | Path                                                   | Purpose                                                          |
| ------ | ------------------------------------------------------ | ---------------------------------------------------------------- |
| POST   | `/api/lovelace/projects/csv-preview`                   | Resolve CSV rows against entities.db without importing           |
| POST   | `/api/lovelace/projects/:id/entities/resolve`          | Resolve entity identifiers (edgar, news/MCP, stocks, polymarket) |
| POST   | `/api/lovelace/projects/:id/entities/enrich-lei`       | Bulk LEI enrichment via GLEIF API                                |
| POST   | `/api/lovelace/projects/:id/entities/screen-sanctions` | Screen entities against sanctions lists                          |
| GET    | `/api/lovelace/projects/:id/resolution-status`         | Get aggregate resolution statistics                              |

### 6.4 Gemini Research

| Method | Path                                  | Purpose                                                 |
| ------ | ------------------------------------- | ------------------------------------------------------- |
| POST   | `/api/lovelace/projects/:id/research` | Run Gemini research query, return candidate entity list |

**Request Body:**

```json
{
    "query": "Top 20 regional banks in the Southeast by total assets",
    "max_entities": 20,
    "prefer_public": true
}
```

**Response:**

```json
{
    "entities": [
        {
            "name": "Regions Financial Corporation",
            "ticker": "RF",
            "rationale": "4th largest regional bank in the Southeastern US with $156B in total assets"
        }
    ],
    "query_interpretation": "Searching for the 20 largest regional banks headquartered in or primarily operating in the Southeastern United States, ranked by total assets.",
    "total_candidates": 20,
    "coverage_notes": "List covers banks with >$10B in assets. Some regional banks operate across multiple regions and were included based on SE headquarters."
}
```

### 6.5 Import Sources

| Method | Path                                            | Purpose                                                 |
| ------ | ----------------------------------------------- | ------------------------------------------------------- |
| POST   | `/api/lovelace/projects/import-from-collection` | Import entities from a Document Graph collection        |
| GET    | `/api/lovelace/projects/:id/relationships`      | Get project relationships (from document graph imports) |
| GET    | `/api/lovelace/projects/:id/events`             | Get project events                                      |

---

## 7. State Management

### 7.1 Composable: `useProject()`

Singleton composable providing reactive project state shared across all modules.

**Reactive State:**

| Ref                           | Type                    | Description                                   |
| ----------------------------- | ----------------------- | --------------------------------------------- |
| `projects`                    | `Project[]`             | All projects                                  |
| `currentProjectId`            | `string \| null`        | Active project ID (persisted to localStorage) |
| `currentProject`              | `computed<Project>`     | Active project object                         |
| `currentProjectEntities`      | `ProjectEntity[]`       | Entities in active project                    |
| `currentProjectRelationships` | `ProjectRelationship[]` | Relationships (from document graph imports)   |
| `currentProjectEvents`        | `ProjectEvent[]`        | Events                                        |
| `loading`                     | `boolean`               | Project-level loading state                   |
| `loadingEntities`             | `boolean`               | Entity fetch in progress                      |
| `enrichmentHydrated`          | `boolean`               | Whether background enrichment has completed   |
| `initialized`                 | `boolean`               | Whether init() has completed                  |
| `error`                       | `string \| null`        | Last error message                            |

**Concurrency Guards:**

- `init()` uses a mutex promise — multiple components calling `init()` in `onMounted` (AppHeader, Monitor, Studio) await the same promise instead of racing.
- `seedDemoProject()` is similarly mutex-guarded.
- `fetchProjectEntities()` uses a sequence counter — if the project switches mid-fetch, the stale response is discarded.

**Two-Phase Entity Loading:**

1. **Fast path:** Fetch entities without enrichment (`include_enrichment=false`) — returns immediately with core fields (name, identifiers, match status).
2. **Background hydration:** Fetch again with `include_enrichment=true` — merges enrichment fields (stock prices, news stats, edgar trends) into existing entities without re-rendering the full list.

This pattern ensures the entity table renders instantly while heavier cross-database joins complete in the background.

### 7.2 Computed Properties

| Computed               | Type              | Usage                                                   |
| ---------------------- | ----------------- | ------------------------------------------------------- |
| `entitiesWithTickers`  | `ProjectEntity[]` | Stock Data module: only entities with tickers           |
| `entityCount`          | `number`          | UI badges and status indicators                         |
| `hasGraphData`         | `boolean`         | Show/hide document graph features                       |
| `isCollectionImport`   | `boolean`         | Adjust UI for collection-sourced projects               |
| `entityTypes`          | `string[]`        | Filter options (organization, person, instrument, etc.) |
| `organizationEntities` | `ProjectEntity[]` | Risk scoring modules: exclude persons/instruments       |

---

## 8. Entity Type System

Entities in the project can be of several types, reflecting the reference graph:

| Type              | Description                                      | Scoring Eligible              | Example                    |
| ----------------- | ------------------------------------------------ | ----------------------------- | -------------------------- |
| `organization`    | Company, bank, fund, government entity           | Yes (FHS, ERS, all lenses)    | JPMorgan Chase & Co.       |
| `person`          | Individual (officer, director, beneficial owner) | No (appears in ERS as signal) | Jamie Dimon                |
| `instrument`      | Financial instrument (bond, stock, derivative)   | Partial (Blast Radius only)   | JPM 4.25% 2032             |
| `location`        | Geographic entity                                | No                            | New York, NY               |
| `fund_account`    | Fund or account structure                        | Yes (limited)                 | JPM Large Cap Growth       |
| `legal_agreement` | Contract, indenture, agreement                   | No                            | Trust Indenture dated 2020 |

For unmatched entities during CSV import, the system uses heuristics to suggest a type (names matching person patterns like "John Smith" → `person`, otherwise → `organization`). The analyst can override via bulk assignment or per-entity toggle.

---

## 9. Integration Points

### 9.1 Downstream Module Dependencies

| Module                        | What It Reads from Project          | Required Identifiers                               |
| ----------------------------- | ----------------------------------- | -------------------------------------------------- |
| **Studio** (FHS/ERS scoring)  | `organizationEntities`, assessments | CIK (for SEC filings), NEID (for events)           |
| **Monitor** (surveillance)    | All entities, assessments, events   | CIK, NEID                                          |
| **Dashboard** (network graph) | Entities, relationships             | CIK (for relationship graph)                       |
| **News Data**                 | Entities with NEID                  | NEID (required for news matching)                  |
| **Stock Data**                | `entitiesWithTickers`               | Ticker (required for price data)                   |
| **Polymarket**                | Entities with NEID or CIK           | NEID or CIK (for market links)                     |
| **FDIC Data**                 | Organization entities               | CIK or CERT number                                 |
| **GLEIF Data**                | Organization entities               | LEI (for legal entity data)                        |
| **Sanctions Screening**       | All entities                        | Name (for screening), any hard ID for confirmation |
| **Document Graph**            | Can import into project             | Collection ID                                      |

### 9.2 Elemental MCP Integration

The resolution pipeline calls Elemental MCP for NEID resolution:

```python
call_tool('elemental_get_entity', {'entity': entity_name})
```

The MCP client tries multiple name variants (raw name, without share class suffix, without legal suffix) and extracts the NEID from the structured response. This is the primary path for connecting project entities to Elemental's knowledge graph.

### 9.3 OpenFIGI Integration

Optional enrichment step during CSV import. When enabled:

- Unmatched entities with CUSIP/ISIN/ticker are sent to OpenFIGI API
- Returns FIGI, composite_figi, security type, exchange information
- Conflicts between existing and OpenFIGI data are surfaced for analyst resolution

---

## 10. Performance Considerations

| Concern                        | Approach                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Large CSV (1000+ entities)     | Batch import in groups of 50 with progress UI                                  |
| Entity fetch latency           | Two-phase loading (fast base + background enrichment)                          |
| Concurrent init calls          | Mutex promises prevent redundant API calls                                     |
| Project switch race conditions | Sequence counter on entity fetches; clear state before switching               |
| Resolution pipeline speed      | Hard ID matches are instant (SQL lookup); MCP calls are bounded by concurrency |
| Stale enrichment data          | `enrichmentHydrated` flag tracks whether background pass completed             |

---

## 11. Build Phases

### Phase 1: Current State (Implemented)

- [x] Project CRUD (create, read, update, delete)
- [x] CSV upload with column mapping and resolution preview
- [x] Individual entity search and addition
- [x] Multi-source entity resolution (entities.db, MCP, OpenFIGI)
- [x] Identifier coverage and resolution strength display
- [x] Entity type assignment for unmatched entities
- [x] Identifier conflict resolution (existing vs OpenFIGI)
- [x] Project switching with two-phase entity loading
- [x] Demo project seeding
- [x] Document Graph collection import

### Phase 2: Gemini Research (Next)

- [ ] Gemini research query endpoint (`POST /projects/:id/research`)
- [ ] Research query UI with template suggestions
- [ ] Candidate review and selection flow
- [ ] Research results → resolution pipeline integration
- [ ] Research history (save past queries and results per project)

### Phase 3: Resolution Quality

- [ ] Resolution confidence dashboard (aggregate stats across project)
- [ ] Bulk re-resolution with change detection ("3 entities changed CIK since last resolve")
- [ ] Scheduled re-resolution (daily/weekly background refresh)
- [ ] Entity merge/split handling (when two project entities resolve to the same canonical record)
- [ ] Resolution audit log (track when/how each identifier was set)

### Phase 4: Advanced Ingestion

- [ ] Watchlist import (import from external watchlist providers)
- [ ] API-driven entity addition (programmatic project building)
- [ ] Entity cloning between projects
- [ ] Project templates (pre-built entity lists for common use cases: "S&P 500", "Russell 2000", "FDIC Problem Banks")

---

## 12. Success Criteria

### Demo-Ready (Phase 1 — Current)

- [x] Analyst can create a project and add entities via CSV, search, or document graph import
- [x] CSV resolution correctly matches 85%+ of entities with known CIK/ticker
- [x] Resolution preview shows match confidence, method, and identifier coverage
- [x] Project switching is instant (no stale data flash)
- [x] Downstream modules (Studio, Monitor, News, Stocks) correctly read project entities

### Research-Ready (Phase 2)

- [ ] Analyst can describe a research query in natural language and receive a structured entity list
- [ ] Gemini-generated entities resolve at 70%+ match rate against entities.db/MCP
- [ ] Research templates cover the five most common use cases
- [ ] Full flow (query → review → resolve → add) completes in under 30 seconds for 20 entities

### Production-Ready (Phase 3+)

- [ ] Resolution confidence is visible at project level (dashboard showing coverage gaps)
- [ ] Stale resolution is auto-detected and analyst is prompted to re-resolve
- [ ] Entity merge conflicts are surfaced and resolvable
- [ ] Audit log tracks all resolution changes for compliance
