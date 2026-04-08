# Data Sources Module — Product Requirements Document

**Created:** 2026-04-07
**Author:** Lovelace AI
**Status:** Draft
**App ID:** my-dserp-fsi

---

## 1. Product Vision

### What We're Building

The **Data Sources Module** is a unified tabbed workspace that gives analysts access to every external data source integrated into the FSI Credit Monitor. Each tab is a self-contained data workspace — EDGAR filings, news articles, stock prices, prediction markets, regulatory data, sanctions lists, and macroeconomic indicators — all filtered through the analyst's active project entity list.

### The Core Experience

The analyst selects a project (a list of entities they care about) and then navigates across data sources to understand what data exists for those entities, how fresh it is, and what signals it produces. Each data source answers a different question:

| Source         | Question It Answers                                                    |
| -------------- | ---------------------------------------------------------------------- |
| **EDGAR**      | What has this company disclosed to the SEC? What events have occurred? |
| **News**       | What is the media saying? What is the sentiment trajectory?            |
| **Stocks**     | How is the market pricing this entity? Are there anomalies?            |
| **Polymarket** | What does the prediction market think will happen?                     |
| **GLEIF**      | What is the legal entity hierarchy? Who owns whom?                     |
| **FDIC**       | Is this a bank? What is its regulatory standing?                       |
| **Sanctions**  | Is this entity on any sanctions or denied-party list?                  |
| **Economic**   | What macro conditions affect this entity's sector?                     |

### Design Principles

1. **Project-Scoped by Default** — Every data source tab shows data filtered to the current project's entities. Global browsing is secondary.
2. **Source-Specific Depth** — Each tab is a full workspace with its own tabs, filters, detail panels, and actions. Not a summary — the full data exploration experience.
3. **Unified Shell, Independent Modules** — The Data Sources page is a tabbed container. Each child workspace is a standalone feature module that can also be accessed via direct URL.
4. **Significance, Not Severity** — Data source modules surface raw data tagged with _significance_ (notable vs routine). _Severity_ assessment (CRITICAL/HIGH/WATCH/NORMAL) is the responsibility of the Artifact Studio and Monitor modules downstream.
5. **Lazy Loading** — Each workspace is async-loaded only when its tab is selected. `KeepAlive` preserves state when switching between tabs.

---

## 2. Architecture

### 2.1 Module Hierarchy

```
Data Sources (shell module)
├── /data-sources/edgar      → Edgar Data (lovelace-dashboard)
├── /data-sources/news       → News Data
├── /data-sources/stocks     → Stock Data
├── /data-sources/polymarket → Polymarket Data
├── /data-sources/gleif      → GLEIF Data
├── /data-sources/fdic       → FDIC Data
├── /data-sources/sanctions  → Sanctions Screening
└── /data-sources/economic   → Economic Data (FRED)
```

The shell module (`features/data-sources`) provides the tab bar and async component loading. Each child workspace is a separate feature module under `features/` with its own `index.ts`, pages, components, and composables.

### 2.2 Module Registration

The shell module is registered in the sidebar navigation (order: 1, section: main). Child modules are registered with `show: () => false` — they appear as tabs within Data Sources, not as independent sidebar items. Legacy direct URLs (`/news-data`, `/stock-data`, etc.) are redirected to `/data-sources/news`, `/data-sources/stocks` via the watchdog middleware.

### 2.3 Project Integration

All child modules (except FDIC) consume the global project state via `useProject()`:

```typescript
const { currentProject, currentProjectEntities, entitiesWithTickers } = useProject();
```

Modules that require project context show an empty state if no project is loaded. The project selector in `AppHeader` controls which entities appear across all data source tabs.

### 2.4 Data Flow

```
                    ┌──────────────┐
                    │   Analyst    │
                    └──────┬───────┘
                           │ selects project + data source tab
                           ▼
                    ┌──────────────┐
                    │ Data Sources │  (shell: tab routing)
                    │    Shell     │
                    └──────┬───────┘
                           │ loads async component
                           ▼
              ┌────────────────────────┐
              │  Source-Specific Page   │  (e.g., News Data)
              │  ┌──────────────────┐  │
              │  │ useProject()     │──┼──→ project_entities (projects.db)
              │  │ useSourceData()  │──┼──→ source-specific API endpoints
              │  └──────────────────┘  │
              └────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
              Server APIs    External APIs
              (Nitro)        (via Python)
                    │             │
              ┌─────┴─────┐  ┌───┴────┐
              │ entities.db│  │ GLEIF  │
              │ filings.db │  │ FRED   │
              │ news.db    │  │ Yahoo  │
              │ projects.db│  │ Trade  │
              └────────────┘  │ Gamma  │
                              └────────┘
```

---

## 3. Data Source: EDGAR

### 3.1 Purpose

SEC EDGAR filings and disclosure data. The primary structured data source for public companies. Provides filing history, financial facts, corporate events (C-suite departures, auditor changes, restructurings), and the entity reference graph (organizations, persons, relationships).

### 3.2 Module Definition

| Property         | Value                         |
| ---------------- | ----------------------------- |
| Module ID        | `edgar`                       |
| Name             | Edgar Data                    |
| Icon             | `mdi-database`                |
| Route            | `/data-sources/edgar`         |
| Project Required | Yes (via project entity list) |

### 3.3 Workspace Tabs

| Tab               | Content                                                                                   | Data Source                                             |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Watchlist**     | Risk-ranked entity table with severity tiers, score trends, and assessment status         | `entities.db` + `projects.db` assessments               |
| **Companies**     | Browse all organizations in the reference graph                                           | `entities.db/organizations`                             |
| **People**        | Browse persons (officers, directors) linked to project entities                           | `entities.db/persons`                                   |
| **Instruments**   | Financial instruments (bonds, derivatives) linked to project entities                     | `entities.db/instruments`                               |
| **Locations**     | Geographic entities with geocoded coordinates                                             | `entities.db/locations`                                 |
| **Events**        | Corporate events extracted from SEC filings (8-K items, C-suite changes, auditor changes) | `filings.db/events`                                     |
| **Filings**       | Raw SEC filing browser with form type filters                                             | `filings.db/filings`                                    |
| **Network Graph** | Force-directed graph of entity relationships (subsidiary_of, officer_of, etc.)            | `entities.db` relationships via `/api/lovelace/network` |

### 3.4 Key Features

- **Entity Profile Dialog**: Click any entity to open a modal with full profile, risk scores, filing history, related entities, events, and analyst assessment form
- **Network Graph**: Sigma/Graphology visualization with ForceAtlas2 layout, entity type color coding, and Louvain community detection
- **Risk Watchlist**: Sortable by FHS, ERS, fused score, event pressure, blast radius — the primary "sorting the list" view
- **System Status**: Pipeline health indicator showing last ingest timestamp and entity/filing counts

### 3.5 Data Pipeline

EDGAR data is populated via an offline nightly pipeline (not real-time):

```
SEC EDGAR Bulk Download
      → Parse filings (10-K, 10-Q, 8-K, DEF14A, 13-F, etc.)
      → Extract facts (XBRL), events, relationships, officers
      → Compute derived metrics (ratios, trends, velocity)
      → Write to entities.db + filings.db
      → Record pipeline completion in fetch_schedule
```

### 3.6 Key API Endpoints

| Method | Path                                       | Purpose                                                    |
| ------ | ------------------------------------------ | ---------------------------------------------------------- |
| GET    | `/api/lovelace/entities/:id`               | Full entity profile (facts, metrics, events, filing count) |
| GET    | `/api/lovelace/entities/:id/filings`       | Filing list for entity by CIK                              |
| GET    | `/api/lovelace/entities/:id/relationships` | Relationships (officers, subsidiaries, etc.)               |
| GET    | `/api/lovelace/events/entities`            | Events across project entities                             |
| POST   | `/api/lovelace/network`                    | Build relationship network graph                           |
| GET    | `/api/lovelace/edgar-watchlists/:id`       | Watchlist with risk scores                                 |
| GET    | `/api/lovelace/galaxy-data`                | Full entity universe for graph layouts                     |

---

## 4. Data Source: News

### 4.1 Purpose

Entity-linked news articles, sentiment analysis, mention velocity, and standardized news events. The primary unstructured data source. Provides real-time signal about what the market and media are saying about project entities.

### 4.2 Module Definition

| Property         | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| Module ID        | `news-data`                                           |
| Name             | News Data                                             |
| Icon             | `mdi-newspaper-variant-outline`                       |
| Route            | `/data-sources/news`                                  |
| Project Required | Yes                                                   |
| Key Identifier   | NEID (News Entity ID — required for article matching) |

### 4.3 Workspace Tabs

| Tab                  | Content                                                                               | Data Source                                 |
| -------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Entities**         | Entity list with NEID status, mention counts, sentiment, velocity, headline summaries | `projects.db` + `news.db` batch stats       |
| **Recent Articles**  | Paginated article feed filtered by project entity NEIDs                               | `news.db/news_articles` + `entity_mentions` |
| **Events**           | Standardized news events (earnings, M&A, regulatory actions)                          | `news.db` event extraction                  |
| **Network**          | Co-mention network graph — which entities appear together in articles                 | `news.db` mention co-occurrence             |
| **Portfolio Update** | AI-generated portfolio narrative summarizing news across all entities                 | Gemini synthesis over cached news           |
| **Data**             | Raw data tables and sync status                                                       | `news.db` diagnostics                       |

### 4.4 Key Features

- **Entity Overview Modal**: Click an entity to see its news profile — recent articles, sentiment chart, mention velocity sparkline, NEID resolution status
- **Batch Stats**: Efficient bulk stats endpoint that returns mention_count_30d, sentiment_avg_30d, sentiment_trend, mention_velocity for all project entities in one call
- **News Sync**: Trigger sync for all entities or individual entities. Sync pulls articles from the news provider (GCS-backed), caches them locally, and updates mention/sentiment stats
- **NEID Resolution**: Entities without NEID can be resolved via MCP (`elemental_get_entity`) or manual assignment. The "Sync & Resolve" action runs both
- **Headline Summaries**: AI-generated one-line summary of each entity's recent news coverage
- **CSV Upload**: Import entity lists directly into the news workspace

### 4.5 Signals Produced

| Signal                | Computation                                                      | Used By                        |
| --------------------- | ---------------------------------------------------------------- | ------------------------------ |
| `mention_count_30d`   | Count of articles mentioning entity in last 30 days              | Monitor alerts, Studio scoring |
| `sentiment_avg_30d`   | Average sentiment score (-1 to +1) over 30 days                  | Studio fused scoring           |
| `sentiment_trend`     | Direction of sentiment change (improving/declining/stable)       | Monitor trend detection        |
| `mention_velocity`    | Rate of change in mention frequency                              | Event Pressure lens            |
| `mention_ratio_label` | Categorized mention pattern (high_positive, high_negative, etc.) | Risk triage                    |
| `headline_summary`    | AI-generated summary of recent coverage                          | Entity overview                |

### 4.6 Key API Endpoints

| Method | Path                                    | Purpose                                                   |
| ------ | --------------------------------------- | --------------------------------------------------------- |
| GET    | `/api/lovelace/news-articles`           | Articles filtered by NEIDs, project, date range           |
| POST   | `/api/lovelace/news-entity/sync`        | Sync news data for entity (articles, mentions, sentiment) |
| POST   | `/api/lovelace/news-entity/batch-stats` | Bulk stats for all project entities                       |
| POST   | `/api/lovelace/news-match`              | Match entity name to NEID via news provider               |
| POST   | `/api/lovelace/news-lists/:id/sync`     | Sync entire list — pulls articles for all members         |
| GET    | `/api/lovelace/news/:id`                | Single article detail                                     |

---

## 5. Data Source: Stocks

### 5.1 Purpose

Real-time and historical stock market data. Price quotes, analytics, anomaly detection, and stock-linked events for entities with tickers. Provides the market's quantitative opinion on entity health.

### 5.2 Module Definition

| Property         | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| Module ID        | `stock-data`                                             |
| Name             | Stock Data                                               |
| Icon             | `mdi-chart-line`                                         |
| Route            | `/data-sources/stocks`                                   |
| Project Required | Yes                                                      |
| Key Identifier   | Ticker (required — only `entitiesWithTickers` are shown) |

### 5.3 Workspace Tabs

| Tab             | Content                                                                      | Data Source                         |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| **Price Table** | Sortable table with latest quotes, daily/30-day change, volume, 30-day trend | `news.db/stock_quotes` via yfinance |
| **Price Cards** | Card grid view with sparkline charts per entity                              | Same + price history                |
| **Analytics**   | Technical analytics — moving averages, volatility, anomaly flags             | `news.db/stock_analytics`           |
| **Events**      | Stock-linked events — anomalies, large moves, earnings surprises             | Computed from price/volume data     |
| **Summary**     | AI-generated market summary across all project tickers                       | Gemini synthesis                    |
| **Details**     | Single-entity deep dive with full price history chart and company info       | yfinance company info + history     |

### 5.4 Key Features

- **Stock Sync**: Pulls latest quotes from Yahoo Finance (yfinance, no API key required), caches in `news.db`
- **Price History**: Full price history charts with configurable timeframes
- **Anomaly Detection**: Statistical anomaly flagging for price and volume deviations
- **30-Day Metrics**: Pre-computed 30-day change, trend direction, high/low, volatility for each ticker
- **Detail Panel**: Side panel with comprehensive stock info (company profile, key statistics, price chart)

### 5.5 Signals Produced

| Signal                     | Computation                                | Used By              |
| -------------------------- | ------------------------------------------ | -------------------- |
| `stock_price`              | Latest closing price                       | Entity enrichment    |
| `stock_change_percent`     | Daily percentage change                    | Monitor alerts       |
| `stock_change_30d_percent` | 30-day percentage change                   | Studio scoring       |
| `stock_trend_30d`          | Trend direction (positive/negative/stable) | Dashboard indicators |
| `stock_volatility_30d`     | 30-day price volatility                    | Risk assessment      |
| Anomaly events             | Statistical outliers in price/volume       | Event Pressure lens  |

### 5.6 Key API Endpoints

| Method | Path                                       | Purpose                          |
| ------ | ------------------------------------------ | -------------------------------- |
| GET    | `/api/lovelace/stocks/quotes`              | Cached quotes for tickers        |
| POST   | `/api/lovelace/stocks/sync`                | Pull latest from Yahoo Finance   |
| GET    | `/api/lovelace/stocks/history/:ticker`     | Price history for a ticker       |
| GET    | `/api/lovelace/stocks/info/:ticker`        | Company info from Yahoo Finance  |
| GET    | `/api/lovelace/stocks/analytics/:ticker`   | Technical analytics for a ticker |
| GET    | `/api/lovelace/stocks/analytics/anomalies` | Anomaly detection across tickers |
| GET    | `/api/lovelace/stocks/events`              | Stock-derived events             |

---

## 6. Data Source: Polymarket

### 6.1 Purpose

Prediction market data from Polymarket. Links prediction markets to project entities to surface forward-looking sentiment — what does the crowd think will happen? Useful as a leading indicator that often moves before traditional news.

### 6.2 Module Definition

| Property         | Value                                   |
| ---------------- | --------------------------------------- |
| Module ID        | `polymarket-data`                       |
| Name             | Polymarket Data                         |
| Icon             | `mdi-chart-timeline-variant`            |
| Route            | `/data-sources/polymarket`              |
| Project Required | Yes                                     |
| Key Identifiers  | NEID or CIK (for entity-market linking) |

### 6.3 Workspace Tabs

| Tab          | Content                                                                           | Data Source                                        |
| ------------ | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Entities** | Project entities with linked market counts, outlook scores, active/closed markets | `news.db/entity_market_links`                      |
| **Markets**  | Browse all synced Polymarket events and markets with prices                       | `news.db/polymarket_events` + `polymarket_markets` |
| **Summary**  | AI-generated summary of prediction market signals for project entities            | Gemini synthesis                                   |
| **Network**  | Entity-market link graph showing which entities connect to which markets          | Link graph visualization                           |
| **Timeline** | Temporal view of market creation/resolution dates                                 | Market metadata                                    |
| **Events**   | Significant market movements and resolution events                                | Price change detection                             |
| **Alerts**   | Threshold-based alerts when market probabilities cross configurable levels        | Computed from market prices                        |

### 6.4 Key Features

- **Market Sync**: Pulls active events from Polymarket's Gamma API (paginated, up to 20 pages of active events)
- **Entity Linking**: Manual and auto-suggested links between project entities and Polymarket markets
- **Outlook Scoring**: Aggregated entity outlook (positive/neutral/negative) based on linked market probabilities
- **Import by URL**: Import specific Polymarket events by URL
- **Detail Panel**: Side panel with market details, price chart, and entity links

### 6.5 Signals Produced

| Signal                        | Computation                      | Used By              |
| ----------------------------- | -------------------------------- | -------------------- |
| `polymarket_links`            | Count of linked markets          | Entity enrichment    |
| `polymarket_active_count`     | Active linked markets            | Monitor alerts       |
| `polymarket_outlook`          | Aggregated outlook direction     | Risk assessment      |
| `polymarket_outlook_score`    | Numeric outlook score            | Studio fused scoring |
| `polymarket_positive_markets` | Markets with favorable outcome   | Sentiment indicators |
| `polymarket_negative_markets` | Markets with unfavorable outcome | Risk indicators      |

### 6.6 Key API Endpoints

| Method | Path                                      | Purpose                                  |
| ------ | ----------------------------------------- | ---------------------------------------- |
| POST   | `/api/lovelace/polymarket/sync`           | Sync events from Gamma API               |
| GET    | `/api/lovelace/polymarket/entity-links`   | Entity-market links with optional trends |
| GET    | `/api/lovelace/polymarket/linked-markets` | Markets linked to entities with stats    |
| POST   | `/api/lovelace/polymarket/sync-search`    | Search and sync specific markets         |

---

## 7. Data Source: GLEIF

### 7.1 Purpose

Legal Entity Identifier (LEI) data from GLEIF. Provides the authoritative legal identity, jurisdiction, registered address, and corporate hierarchy (parent/subsidiary relationships) for entities. Critical for regulatory compliance and understanding who owns whom.

### 7.2 Module Definition

| Property         | Value                            |
| ---------------- | -------------------------------- |
| Module ID        | `gleif-data`                     |
| Name             | GLEIF Data                       |
| Icon             | `mdi-domain`                     |
| Route            | `/data-sources/gleif`            |
| Project Required | Yes (`requires: ['useProject']`) |
| Key Identifier   | LEI                              |

### 7.3 Workspace Tabs

| Tab                 | Content                                                                   | Data Source                          |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------ |
| **Entities**        | Project entities with LEI coverage indicators, legal names, jurisdictions | `entities.db` LEI fields + GLEIF API |
| **Network**         | Corporate hierarchy graph — parent/child/ultimate parent relationships    | GLEIF relationship API               |
| **Events**          | LEI lifecycle events (registration, renewal, lapse)                       | GLEIF API                            |
| **Analysis**        | LEI coverage analysis across the portfolio                                | Computed from entity data            |
| **Summary**         | AI-generated summary of corporate structure findings                      | Gemini synthesis                     |
| **Resolution Gaps** | Entities missing LEI with resolution suggestions                          | Computed gap analysis                |

### 7.4 Key Features

- **LEI Lookup**: Search GLEIF Global LEI Index by LEI, name, or other identifiers
- **Batch LEI Enrichment**: "Find LEIs" button resolves LEI for all project entities missing one
- **Corporate Hierarchy**: Visualize parent-subsidiary chains via GLEIF relationship data
- **Resolution Gap Analysis**: Identify which project entities lack LEI and why (no match, multiple candidates, etc.)
- **LEI Caching**: Results cached in `entities.db/lei_cache` to minimize API calls

### 7.5 Key API Endpoints

| Method | Path                                             | Purpose                                 |
| ------ | ------------------------------------------------ | --------------------------------------- |
| GET    | `/api/lovelace/gleif/lookup`                     | LEI lookup by LEI or name search        |
| GET    | `/api/lovelace/gleif/relationships`              | Parent/subsidiary relationships for LEI |
| POST   | `/api/lovelace/gleif/enrich`                     | Batch enrich entities with LEI data     |
| POST   | `/api/lovelace/projects/:id/entities/enrich-lei` | Project-level LEI enrichment            |
| GET    | `/api/lovelace/projects/:id/gleif/structure`     | Portfolio-level GLEIF structure         |

---

## 8. Data Source: FDIC

### 8.1 Purpose

FDIC BankFind data for banking institutions. Provides regulatory identifiers (CERT number), institution details, branch locations, financial history, deposit data, failure records, and succession chains. Not project-scoped by default — functions as a reference data browser with optional linkage to project entities via resolved CIK.

### 8.2 Module Definition

| Property         | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| Module ID        | `fdic-data`                                                 |
| Name             | FDIC Data                                                   |
| Icon             | `mdi-bank`                                                  |
| Route            | `/data-sources/fdic`                                        |
| Project Required | No (global browser; entity linkage optional)                |
| Key Identifier   | CERT number (FDIC certificate), linkable via `resolved_cik` |

### 8.3 Workspace Tabs

| Tab            | Content                                                     | Data Source                         |
| -------------- | ----------------------------------------------------------- | ----------------------------------- |
| **Entities**   | Browse FDIC institutions with filters (state, status, type) | `entities.db/fdic_institutions`     |
| **Locations**  | Branch locations with geographic data                       | `entities.db/fdic_locations`        |
| **History**    | Historical institution data and changes                     | FDIC bulk data                      |
| **Failures**   | Failed bank records and resolution details                  | FDIC failure records                |
| **Deposits**   | Summary of Deposits (SOD) data                              | FDIC SOD data                       |
| **Events**     | FDIC-derived events (failures, mergers, acquisitions)       | Computed from FDIC data             |
| **Analysis**   | Analytical views across the FDIC dataset                    | Aggregate computations              |
| **Resolution** | CERT-to-CIK resolution and succession chain tracking        | `resolved_cik` + `entity_id_lookup` |

### 8.4 Key Features

- **CERT-to-CIK Resolution**: Link FDIC institutions to SEC registrants via manual or automated CIK matching
- **Succession Chains**: Track bank mergers, acquisitions, and name changes through FDIC succession data
- **Entity Detail Panel**: Click an institution for full FDIC profile with financial summary and branch map
- **Bulk Data**: Pre-loaded from FDIC bulk downloads (institutions, SOD, failures)

### 8.5 Key API Endpoints

| Method | Path                                    | Purpose                        |
| ------ | --------------------------------------- | ------------------------------ |
| GET    | `/api/lovelace/fdic/institutions`       | List institutions with filters |
| GET    | `/api/lovelace/fdic/institutions/:cert` | Single institution detail      |
| POST   | `/api/lovelace/fdic/resolve`            | Link CERT to CIK manually      |
| GET    | `/api/lovelace/fdic/events`             | FDIC-derived events            |
| GET    | `/api/lovelace/fdic/resolution-stats`   | Resolution coverage statistics |

---

## 9. Data Source: Sanctions

### 9.1 Purpose

Sanctions and denied-party screening for project entities. Screens against the Consolidated Screening List (CSL) from Trade.gov and OFAC SDN lists. Critical for KYC/AML compliance workflows — every entity in the project can be screened with match results persisted for audit.

### 9.2 Module Definition

| Property         | Value                            |
| ---------------- | -------------------------------- |
| Module ID        | `sanctions-screening`            |
| Name             | Sanctions Screening              |
| Icon             | `mdi-shield-search`              |
| Route            | `/data-sources/sanctions`        |
| Project Required | Yes (`requires: ['useProject']`) |

### 9.3 Workspace Tabs

| Tab                | Content                                                                          | Data Source                     |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------------- |
| **Screening**      | Project entities with screening results: clear/match/pending status, match count | `projects.db` screening results |
| **Sanctions List** | Browse the full sanctions database with search and filters                       | Local sanctions DB (CSL + OFAC) |

### 9.4 Key Features

- **Bulk Screening**: "Screen All Entities" runs every project entity against sanctions lists
- **Match Results**: Each entity gets a status (`clear`, `match`, `pending`) with match count and matched entries detail
- **Match Detail Panel**: Click a match to see the specific sanctions list entry, programs, addresses, and aliases
- **Entity Detail Panel**: View entity screening history and manually override screening status
- **List Refresh**: Pull latest sanctions data from Trade.gov CSL API and OFAC CSV feeds
- **Screening Persistence**: Results stored in `projects.db` for audit trail (`sanctions_status`, `sanctions_match_count`, `sanctions_checked_at`)

### 9.5 Signals Produced

| Signal                  | Computation                        | Used By              |
| ----------------------- | ---------------------------------- | -------------------- |
| `sanctions_status`      | clear / match / pending            | Entity risk profile  |
| `sanctions_match_count` | Number of sanctions list matches   | Risk triage          |
| `is_sanctioned`         | Boolean from reference entity data | Entity resolution    |
| `sanctions_lists`       | Which lists the entity appears on  | Compliance reporting |

### 9.6 Key API Endpoints

| Method | Path                                                   | Purpose                       |
| ------ | ------------------------------------------------------ | ----------------------------- |
| POST   | `/api/lovelace/projects/:id/entities/screen-sanctions` | Screen all project entities   |
| GET    | `/api/lovelace/projects/:id/sanctions/results`         | Get screening results         |
| POST   | `/api/lovelace/sanctions/screen`                       | Screen individual entity      |
| POST   | `/api/lovelace/sanctions/refresh`                      | Refresh sanctions list data   |
| GET    | `/api/lovelace/sanctions/entries`                      | Browse sanctions list entries |
| GET    | `/api/lovelace/sanctions/stats`                        | Sanctions database statistics |

---

## 10. Data Source: Economic (FRED)

### 10.1 Purpose

Macroeconomic indicators from the Federal Reserve Economic Data (FRED) system. Provides sector-level economic context for the project portfolio — interest rates, GDP, unemployment, inflation, sector indices — so analysts can understand how macro conditions affect their entities.

### 10.2 Module Definition

| Property            | Value                               |
| ------------------- | ----------------------------------- |
| Module ID           | `fred-data`                         |
| Name                | Economic Data                       |
| Icon                | `mdi-finance`                       |
| Route               | `/data-sources/economic`            |
| Project Required    | Yes (`requires: ['useProject']`)    |
| External Dependency | FRED API key (environment variable) |

### 10.3 Workspace Tabs

| Tab                   | Content                                                                    | Data Source                                  |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| **Macro Dashboard**   | Key macro indicators relevant to the project's sector mix                  | `/api/lovelace/projects/:id/macro/dashboard` |
| **Sector Indicators** | Sector-specific metrics (financials, healthcare, energy, etc.)             | FRED API series by SIC code                  |
| **Network**           | Sector exposure graph showing which sectors the project is concentrated in | Computed from entity SIC codes               |
| **Analysis**          | Macro-to-entity impact analysis                                            | Gemini synthesis                             |
| **Summary**           | AI-generated macro conditions briefing                                     | Gemini over FRED data                        |
| **Browse**            | Search and explore the full FRED catalog                                   | FRED API search                              |

### 10.4 Key Features

- **Portfolio-Aware Dashboard**: Automatically selects macro indicators based on the sector composition of the project's entities (e.g., a bank-heavy project shows Treasury yields and FDIC stress indicators)
- **Event Context**: Overlay macro events on entity timelines to understand if sector-wide conditions explain entity-specific movements
- **Series Browser**: Search FRED's catalog of 800K+ data series and view observations
- **FRED Disclaimer**: UI includes required disclaimer that the data is not endorsed by the Federal Reserve Bank of St. Louis

### 10.5 Key API Endpoints

| Method | Path                                             | Purpose                                 |
| ------ | ------------------------------------------------ | --------------------------------------- |
| GET    | `/api/lovelace/fred/series`                      | Search FRED series catalog              |
| GET    | `/api/lovelace/fred/observations`                | Get observations for a series           |
| GET    | `/api/lovelace/fred/dashboard`                   | Pre-configured macro dashboard          |
| GET    | `/api/lovelace/projects/:id/macro/dashboard`     | Project-specific macro dashboard        |
| GET    | `/api/lovelace/projects/:id/macro/event-context` | Macro event context for entity timeline |

---

## 11. Data Source Status & Pipeline Health

### 11.1 Status API

The `GET /api/lovelace/data-source-status` endpoint provides operational health for each data source. This powers the Data Monitor (Settings module) and can be surfaced as status indicators in each data source tab.

**Per-Source Status:**

| Field                 | Type           | Description                              |
| --------------------- | -------------- | ---------------------------------------- |
| `status`              | string         | `healthy`, `warning`, `error`, `unknown` |
| `lastIngestAt`        | ISO datetime   | Last successful data pull                |
| `records`             | number         | Total records in the source              |
| `successRate`         | number (0-100) | 30-day success rate of sync operations   |
| `lastError`           | string         | Most recent error message (if any)       |
| `lastDurationSeconds` | number         | Duration of last sync                    |

**Sources Tracked:**

| Card ID      | Data Source                  | Frequency      | Tracking Mechanism                           |
| ------------ | ---------------------------- | -------------- | -------------------------------------------- |
| `edgar`      | SEC EDGAR pipeline           | Nightly        | `pipeline_runs` table in `news.db`           |
| `news`       | News articles (GCS)          | Configurable   | `fetch_schedule` + `news_articles` watermark |
| `stocks`     | Yahoo Finance                | Configurable   | `fetch_schedule` source=stocks               |
| `polymarket` | Polymarket Gamma API         | Configurable   | `fetch_schedule` source=polymarket           |
| `gleif`      | GLEIF Global LEI Index       | Configurable   | `fetch_schedule` source=gleif                |
| `fdic`       | FDIC bulk data               | Pipeline phase | `pipeline_step_results` phase=fdic           |
| `sanctions`  | Trade.gov CSL + OFAC         | Pipeline phase | `pipeline_step_results` phase=external       |
| `enrichment` | OpenFIGI + entity enrichment | Pipeline phase | `pipeline_step_results` phase=enrichment     |

### 11.2 Fetch Schedule

Data sources with configurable sync schedules use the `fetch_schedule` table in `news.db`:

| Column             | Type     | Description                                        |
| ------------------ | -------- | -------------------------------------------------- |
| `source`           | string   | Source identifier (stocks, news, polymarket, etc.) |
| `last_status`      | string   | success/failure                                    |
| `last_run_at`      | datetime | Last execution timestamp                           |
| `items_synced`     | number   | Records processed in last run                      |
| `last_error`       | string   | Error from last run                                |
| `duration_seconds` | number   | Last run duration                                  |

---

## 12. Downstream Consumption

Data sources produce raw data and signals. Two downstream modules consume this data to produce analytical outputs:

### 12.1 Artifact Studio (`/studio`)

The Studio consumes data from **all sources simultaneously** to compute fused risk scores:

```
EDGAR (filings, facts, events)
  + News (sentiment, mentions, velocity)
  + Stocks (prices, trends, anomalies)
  + Polymarket (prediction market signals)
  + GLEIF (corporate hierarchy)
  + Sanctions (screening status)
────────────────────────────────
  → Solvency Lens (FHS)
  → Executive Risk Lens (ERS)
  → Event Pressure Lens
  → Blast Radius Lens
  → Fused Risk Score
  → Severity Assessment (CRITICAL/HIGH/WATCH/NORMAL)
```

The Studio's `useFusedScoring` composable calls entity, stock, news, and polymarket endpoints to build a complete entity profile before scoring.

### 12.2 Monitor (`/monitor`)

The Monitor consumes Studio outputs and raw data source feeds for surveillance:

- **Alerts**: Threshold-based triggers on stock price changes, new news events, sanctions matches, score changes
- **Entity Assessment**: Interactive assessment table with full entity profiles pulling from all data sources
- **Agent Briefs**: AI-generated risk briefs that synthesize findings from all data sources

---

## 13. Entity Identifier Matrix

Each data source requires specific identifiers. The Projects Module's resolution pipeline populates these:

| Source         | Required ID         | Fallback                     | What Breaks Without It                        |
| -------------- | ------------------- | ---------------------------- | --------------------------------------------- |
| **EDGAR**      | CIK                 | None                         | No filings, no financial facts, no SEC events |
| **News**       | NEID                | CIK → NEID lookup            | No articles, no sentiment, no mention signals |
| **Stocks**     | Ticker              | None                         | No price data, no analytics                   |
| **Polymarket** | NEID or CIK         | Name (manual linking)        | No market links, no outlook                   |
| **GLEIF**      | LEI                 | Name search                  | No legal entity hierarchy                     |
| **FDIC**       | CERT number         | CIK → CERT resolution        | No banking regulatory data                    |
| **Sanctions**  | Name                | Any hard ID for confirmation | Reduced match confidence                      |
| **Economic**   | SIC code (from CIK) | Sector inference             | Less targeted macro indicators                |

This matrix is why the Projects Module's entity resolution is so critical — incomplete resolution means data source coverage gaps.

---

## 14. File Structure

```
features/
├── data-sources/
│   ├── index.ts                          # Shell module definition
│   └── pages/
│       └── index.vue                     # Tabbed container with async loading
│
├── lovelace-dashboard/                   # EDGAR workspace
│   ├── index.ts
│   ├── pages/
│   │   └── Dashboard.vue                # Main Edgar page (7 tabs)
│   └── components/
│       ├── CompaniesTab.vue
│       ├── PeopleTab.vue
│       ├── InstrumentsTab.vue
│       ├── EventsTab.vue
│       ├── FilingsTab.vue
│       ├── NetworkGraphTab.vue
│       ├── RiskWatchlistTab.vue
│       ├── EntityProfileDialog.vue
│       └── profiles/                     # Entity profile sub-components
│
├── news-data/                            # News workspace
│   ├── index.ts
│   ├── pages/
│   │   └── index.vue                    # Main News page (6 tabs)
│   ├── components/
│   │   ├── EntityListView.vue
│   │   ├── RecentArticlesTab.vue
│   │   ├── EventsTab.vue
│   │   ├── NewsNetworkTab.vue
│   │   ├── EntityNewsPanel.vue
│   │   ├── EntityOverviewModal.vue
│   │   └── CSVUploadDialog.vue
│   └── composables/
│       ├── useNewsLists.ts
│       ├── useEntityMatcher.ts
│       ├── useNewsSync.ts
│       └── useSignals.ts
│
├── stock-data/                           # Stock workspace
│   ├── index.ts
│   ├── pages/
│   │   └── index.vue                    # Main Stock page (6 tabs)
│   ├── components/
│   │   └── StockDetailPanel.vue
│   └── composables/
│       └── useStockData.ts
│
├── polymarket-data/                      # Polymarket workspace
│   ├── index.ts
│   ├── pages/
│   │   └── index.vue                    # Main Polymarket page (7 tabs)
│   └── components/
│       └── EntityDetailPanel.vue
│
├── gleif-data/                           # GLEIF workspace
│   ├── index.ts
│   ├── pages/
│   │   └── index.vue
│   └── composables/
│       └── useGleifData.ts
│
├── fdic-data/                            # FDIC workspace
│   ├── index.ts
│   ├── pages/
│   │   └── index.vue                    # Main FDIC page (8 tabs)
│   └── composables/
│       └── useFdicData.ts
│
├── sanctions-screening/                  # Sanctions workspace
│   ├── index.ts
│   ├── pages/
│   │   └── index.vue                    # Main Sanctions page (2 tabs)
│   ├── components/
│   │   ├── ScreeningTab.vue
│   │   └── SanctionsListTab.vue
│   └── composables/
│       └── useSanctionsScreening.ts
│
└── fred-data/                            # Economic workspace
    ├── index.ts
    ├── pages/
    │   └── index.vue                    # Main Economic page (6 tabs)
    └── composables/
        └── useFredData.ts
```

---

## 15. Build Phases

### Phase 1: Current State (Implemented)

- [x] Data Sources shell with 8 tabbed workspaces
- [x] EDGAR workspace with watchlist, entity browser, events, filings, network graph
- [x] News workspace with entity list, articles, events, network, portfolio update
- [x] Stock workspace with quotes, analytics, anomalies, events
- [x] Polymarket workspace with entity links, markets, alerts
- [x] GLEIF workspace with LEI coverage, hierarchy, enrichment
- [x] FDIC workspace with institution browser, locations, failures, resolution
- [x] Sanctions workspace with bulk screening and list browser
- [x] Economic workspace with macro dashboard and FRED browser
- [x] Pipeline health tracking via data-source-status API
- [x] All workspaces (except FDIC) scoped to current project entities

### Phase 2: Cross-Source Insights

- [ ] Unified event timeline across all data sources (EDGAR events + news events + stock events + Polymarket resolutions)
- [ ] Cross-source entity profile (single view showing what data exists per source for an entity)
- [ ] Data freshness indicators per source per entity (not just per source globally)
- [ ] Source coverage heatmap (which entities have data in which sources)

### Phase 3: Real-Time Feeds

- [ ] WebSocket or SSE-based real-time updates for stocks and news
- [ ] Push-based alerts when new data arrives (not just poll-based sync)
- [ ] Background sync scheduling configurable per source (cron expressions)
- [ ] Sync conflict resolution (when two sources disagree on entity metadata)

### Phase 4: Agent-Driven Data Gathering

- [ ] History Agent autonomously pulls data from all sources for project entities (per Agent-First FSI PRD)
- [ ] Standing instructions for periodic data refresh
- [ ] Agent-triggered re-scan when stale data is detected
- [ ] Context Package caching (pre-computed cross-source data bundles per entity)

---

## 16. Success Criteria

### Current State (Phase 1)

- [x] Analyst can navigate to any data source in 1 click from the Data Sources tab bar
- [x] Each workspace shows data scoped to the current project's entities
- [x] Entity identifiers (CIK, NEID, ticker, LEI, CERT) correctly route to the right data source
- [x] All 8 data sources are lazy-loaded and preserve state when switching tabs
- [x] Pipeline health status is visible for all data sources

### Cross-Source (Phase 2)

- [ ] Analyst can see a single entity's data across all sources in one view
- [ ] Missing data is clearly flagged (e.g., "No NEID — news data unavailable")
- [ ] Unified event timeline shows events from all sources in chronological order
- [ ] Source coverage dashboard shows identifier gaps actionable from the Projects Module

### Agent-Driven (Phase 4)

- [ ] Agents autonomously refresh stale data without analyst intervention
- [ ] Context Packages pre-compute cross-source entity profiles for instant loading
- [ ] Agent activity feed shows data gathering progress across all sources
