# Agent-First FSI Credit Monitor — Design Document

## Project Overview

An **agent-first credit risk monitoring platform** where a 4-agent pipeline (Dialogue, History, Query, Composition) — not manual pipelines — does the work of gathering data from the Elemental Knowledge Graph, interpreting context, running analytics, and surfacing results. The UI is an observation and control surface showing how agents operate.

**Created:** 2026-04-07
**App ID:** fsi
**Description:** Agent-first FSI credit risk monitoring platform
**Last updated:** 2026-04-09

## Product Narrative

The product requirement and demo narrative live in `PRD.md`.
Additional implementation learnings for equity watchlists and Elemental MCP
usage live in `design/elemental-watchlist-learnings.md`.
The concrete import contract for equity universes lives in
`design/equity-watchlist-import-spec.md`.

This app is intentionally a demonstration of an **agent-first, Elemental-grounded financial intelligence workflow**. The product goal is to show that canonical entity resolution, shared graph context, visible multi-agent orchestration, and evidence-backed answers produce a more trustworthy experience than a raw model alone.

The intended runtime boundary is:

`UI -> deployed agents -> Elemental MCP/tooling`

Application APIs remain for product plumbing (project CRUD, persistence, transport). Any direct app-side Elemental REST calls are transitional scaffolding and should be migrated behind deployed agent execution paths.

## Configuration

| Setting        | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Authentication | Auth0 (bypassed in dev via NUXT_PUBLIC_USER_NAME)              |
| Query Server   | https://query.pip.stg.g.lovelace.ai (via Portal Gateway proxy) |
| AI Runtime     | Gemini 2.0 Flash (via GEMINI_API_KEY)                          |

## Architecture

### Core Principle

The 4-agent pipeline is the primary deliverable. Agents reason with Gemini over Elemental data. The UI surfaces agent activity, artifacts, and decisions.

### Agent Pipeline

```
User Request → Dialogue Agent (entity resolution, intent classification)
             → History Agent (Elemental KG retrieval)
             → Query Agent (FHS/ERS risk analysis with Gemini)
             → Composition Agent (output formatting)
             → UI (SSE activity stream + artifact views)
```

### Data Flow

- **Data Source**: Elemental via MCP/tooling through deployed agents
- **Primary Agent Runtime**: ADK agent package `agents/credit_monitor/` (deployed) with root orchestrator + 4 sub-agents
- **Application Runtime**: Nitro server routes for workflow state, persistence, proxying, and UI transport
- **Transitional Paths**: Some Nitro routes still call gateway REST directly and are being migrated behind deployed agents
- **Storage**: KV (Upstash Redis) for projects, entities, scores, sessions, cache
- **Real-time**: SSE activity stream for live agent step visualization

## Pages

### Projects (Home)

Route: `/`
Description: Create and manage entity monitoring lists. Each project is a named set of entities to monitor.
Implementation status: Complete

### Agents (Hero Page)

Route: `/agents`
Description: Agent control surface — the main UI. Activity Feed (live SSE stream of agent steps), Dialogue Chat, Session History, Entity Management.
Implementation status: Complete

### Data Explorer

Route: `/data-explorer`
Description: View project entities through five analytical lenses: Table, Graph, Timeline, Narrative.
Implementation status: Table view + Entity Modal complete. Graph, Timeline, Narrative are placeholders.

### Dashboard

Route: `/dashboard`
Description: Aggregate risk analytics — severity distribution, FHS/ERS lens panels, entity risk table.
Implementation status: Complete (populated when agent scores exist)

### Settings

Route: `/settings`
Description: Elemental API connection status, Gemini AI status, scoring weight configuration.
Implementation status: Complete

## Cross-Cutting Concepts

### Active Project Context

- `useProject()` is the shared project context across modules.
- The selected project in the global sidebar selector sets `activeProject` and loads its entities.
- Agents, Data Explorer, and Dashboard read from the same `activeProject` + `entities` state, so switching projects updates all downstream module views.
- The active project is persisted in localStorage and restored on reload when possible.

### Scoring Model

- **FHS (Financial Health Score)**: Leverage ratio, debt/equity, interest coverage, current ratio, margin trends, equity erosion, staleness decay
- **ERS (Executive Risk Score)**: Officer departures (recency-weighted), C-suite premium, board changes, auditor changes, cumulative patterns
- **Fused Score**: Configurable weighted blend (default: FHS 60%, ERS 40%)
- **Severity Tiers**: Critical (80-100), High (60-79), Watch (40-59), Normal (0-39)

### Agent Types

| Agent       | Color  | Role                                     |
| ----------- | ------ | ---------------------------------------- |
| Dialogue    | Purple | Entity resolution, intent classification |
| History     | Blue   | Elemental KG data retrieval              |
| Query       | Green  | FHS/ERS analysis with Gemini reasoning   |
| Composition | Orange | Output formatting                        |
| Pipeline    | Green  | Orchestration events                     |
