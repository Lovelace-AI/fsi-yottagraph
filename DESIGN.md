# Agent-First FSI Credit Monitor — Design Document

## Project Overview

An **agent-first credit risk monitoring platform** where a 4-agent pipeline (Dialogue, History, Query, Composition) — not manual pipelines — does the work of gathering data from the Elemental Knowledge Graph, interpreting context, running analytics, and surfacing results. The UI is an observation and control surface showing how agents operate.

**Created:** 2026-04-07
**App ID:** fsi
**Description:** Agent-first FSI credit risk monitoring platform
**Last updated:** 2026-04-07

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

- **Data Source**: Elemental API via Portal Gateway proxy (sole external data source)
- **Agent Runtime (Python)**: ADK agent package `agents/credit_monitor/` with root orchestrator + 4 sub-agents
- **Agent Runtime (TypeScript)**: Nitro server routes calling Gemini + Elemental for background scanning
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
