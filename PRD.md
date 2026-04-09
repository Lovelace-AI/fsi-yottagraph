# PRD: Agent-First FSI Credit Monitor Demo

**Product**: FSI Credit Monitor  
**Author**: Lovelace AI  
**Date**: 2026-04-08  
**Status**: Draft

---

## 1. Purpose

This application is a **demonstration product** for an agent-first financial intelligence workflow.

The core thing we are trying to prove is not just that we can show credit-risk data in a UI. We are trying to demonstrate that:

1. **Agents can operate over shared enterprise context** instead of relying on isolated prompts or manual analyst workflows.
2. **Elemental-grounded retrieval produces more defensible answers** than a raw foundation model answering from general knowledge.
3. **A multi-agent pipeline can be made visible and inspectable** so users can understand what the system did, what evidence it used, and where the answer came from.
4. **Project-based monitoring is a practical control surface** for applying agentic intelligence to real portfolios, watchlists, and entity sets.

This app should feel like a working proof of the thesis that Lovelace's value comes from the combination of:

- canonical entity resolution,
- shared graph context,
- evidence-backed retrieval,
- agent orchestration,
- and a UI that makes the runtime legible.

---

## 2. Product Narrative

The demo starts from a simple user need:

**"I have a set of companies or institutions I care about. Help me understand risk, changes, and meaningful context faster than a manual workflow can."**

The app answers that need with an agent-first workflow:

1. The user creates a project that represents a monitoring scope.
2. The user adds entities by search, CSV upload, or Gemini-assisted research.
3. The system resolves those entities against Elemental so the project is anchored to canonical records and identifiers.
4. The user triggers the 4-agent pipeline and watches it retrieve context, analyze entities, and produce artifacts.
5. The user asks follow-up questions in natural language and gets answers grounded in retrieved evidence.
6. The user can compare a raw LLM answer to an Elemental-grounded answer to see the difference that shared context makes.

The product is therefore both:

- a **credit-monitoring experience**, and
- a **live demonstration of Lovelace's agent architecture**.

---

## 2.1 Runtime Model: Agent-First with Transitional APIs

The intended runtime model is:

`UI -> deployed agents -> Elemental MCP/tooling`

This is the architecture the product is demonstrating.

At the same time, the current implementation still contains a **transitional layer** where some workflows are handled by app-side APIs and direct gateway REST calls. Those paths are compatibility scaffolding and should be treated as migration debt, not the end-state architecture.

### MCP in This Product

MCP represents the **agent/tool-calling pattern** for contextual retrieval and graph-aware operations. In the intended architecture, this is how analytical context should be gathered.

In product terms, MCP is where we want the audience to understand:

- an agent can call a capability instead of relying only on prompt text,
- retrieval can be structured and repeatable,
- context comes from a shared knowledge layer rather than being pasted into the model ad hoc,
- and agent behavior can be composed from specialized tools.

In the broader architecture story, the **History Agent** is the clearest MCP-shaped component: it retrieves entity facts, relationships, events, schema information, and related context through tool-like calls against the Elemental capability surface.

### APIs in This Product

APIs are used for the **application delivery layer** and app-owned workflows that power the UI.

In product terms, APIs are responsible for:

- project creation and management,
- CSV preview and import,
- entity add/remove flows,
- research-plan creation,
- scan/session persistence,
- comparison endpoints,
- and the server-side orchestration needed to turn UI actions into results.

These APIs make the product usable as an application. They are not the core thesis by themselves; they are the delivery mechanism around the agent thesis.

In the target state, APIs remain responsible for product plumbing and persistence, while intelligence work is delegated to deployed agents.

### Simple Rule of Thumb

Readers should understand the system this way:

- **Use MCP/tool-calling when the story is "a deployed agent is retrieving or reasoning over shared context."**
- **Use app APIs when the story is "the product is handling workflow state, persistence, or UI transport."**

### Why This Matters to the Demo

The demo is stronger when this distinction is legible:

1. If everything is described as "API calls," the agent/tooling story gets flattened and the architecture feels conventional.
2. If everything is described as "MCP," the app can sound more magical than it really is and the product layer becomes unclear.

The point of the demo is that both are necessary, but with a strict boundary:

- **MCP/tool calling through deployed agents** provides the intelligence runtime.
- **Application APIs** provide product orchestration and persistence around that runtime.

---

## 3. What We Are Demonstrating

### 3.1 Primary Demo Thesis

The primary demonstration is:

**Agentic workflows become materially more useful when they are grounded in a shared, structured knowledge layer and surfaced through an inspectable runtime UI.**

### 3.2 Supporting Claims

The app should make the following claims tangible:

1. **Grounding beats guessing.**  
   The compare view should show that a generic Gemini answer is broad and uncertain, while the Elemental-grounded answer is narrower, evidence-backed, and explicit about limits.

2. **Entity resolution is foundational.**  
   A useful financial workflow begins with correctly identifying the company, institution, or person in question. The project and ingestion flows should show that we can map messy user input to canonical entities.

3. **Agent pipelines do real work.**  
   The activity feed, session history, and scan workflow should show that the system is not a single opaque prompt. It is a staged process with specialized roles.

4. **Users need evidence, not just answers.**  
   Outputs should feel attributable, inspectable, and safer to trust because they are tied to specific retrieved context.

5. **The UI is a control surface, not the intelligence layer.**  
   The most important thing on screen is not raw CRUD or dashboard chrome. It is the user's ability to load scope, run the pipeline, inspect results, and understand what happened.

---

## 4. Target Audience

This demo is primarily for:

- internal product and engineering stakeholders validating the architecture,
- platform stakeholders evaluating the value of Elemental as shared context,
- customer-facing teams who need a concrete story for "agent-first intelligence",
- prospective users who want to see a practical workflow rather than a conceptual architecture diagram.

These audiences do not all need the same depth, but they should all leave with the same understanding:

**the system is better because it combines agents with grounded enterprise context.**

---

## 5. Demo User

The primary user is an **analyst, risk manager, or intelligence operator** who monitors a set of organizations and wants to understand:

- which entities deserve attention,
- what changed,
- where risk may be increasing,
- and what evidence supports that conclusion.

The user is not expected to think in terms of schemas, MCP tools, or retrieval internals. Those details power the experience, but the visible story is:

**"Give me a scoped list, let agents do the work, and show me results I can interrogate."**

---

## 6. Core User Journey

### 6.1 Entry

The user lands on the Projects page and creates a project representing a watchlist, portfolio, or analysis scope.

### 6.2 Population

The user adds entities in one of three ways:

- manual search,
- CSV import,
- Gemini Research Planner.

This step demonstrates that the app can move from ambiguous user input to a usable monitoring scope.

### 6.3 Resolution

The system resolves input entities against Elemental and surfaces confidence, identifiers, and match method. This proves that the project is anchored to real graph entities rather than free-text labels.

**Integration note:** The UX can remain API-shaped, but canonical resolution should execute via deployed agents instead of direct app-side graph calls.

### 6.4 Agent Execution

The user opens the Agents page and runs **Scan All**. The app shows pipeline activity as the system:

- interprets the request,
- retrieves graph context,
- runs analytical reasoning,
- and formats outputs for the UI.

**Integration note:** This is where the architecture must be literal, not metaphorical. The pipeline should execute in deployed agents, with app APIs coordinating execution, persistence, and UI transport.

### 6.5 Inspection

The user reviews:

- activity feed events,
- session history,
- entity list and statuses,
- dashboard scores,
- data explorer views,
- and dialogue responses.

### 6.6 Proof Moment

The user opens the compare view and asks a question such as:

`What is the credit risk profile for Delta Air Lines?`

The app shows:

- a raw model answer from general knowledge,
- an Elemental-grounded answer with evidence,
- and a clear difference in quality, specificity, and defensibility.

This is one of the most important moments in the product narrative.

---

## 7. Product Requirements

### 7.1 Must-Have Demonstration Requirements

1. The app must let the user create and switch between projects.
2. The app must let the user populate a project from manual entry, CSV import, and Gemini-assisted research.
3. The app must resolve entities to canonical records and expose confidence and identifier coverage.
4. The app must present the 4-agent pipeline as distinct stages rather than a single hidden request.
5. The app must support a scan flow that produces visible activity and persisted sessions.
6. The app must support natural-language interaction over the active project.
7. The app must include a side-by-side comparison between ungrounded and grounded model responses.
8. The app must expose enough evidence or trace detail that a viewer can understand why the grounded answer is more trustworthy.

### 7.3 Integration Clarity Requirements

1. The product narrative must clearly distinguish **MCP/tool-calling responsibilities** from **application API responsibilities**.
2. The History Agent and contextual retrieval flow must be described as the primary MCP-shaped part of the system.
3. Project CRUD and persistence flows must be described as application API responsibilities.
4. Scan, contextual analysis, and entity-resolution intelligence flows must be described as **deployed-agent responsibilities**.
5. Any direct app-side Elemental REST usage must be documented as transitional scaffolding with a migration path.

### 7.2 Nice-to-Have Demonstration Requirements

1. Dashboard and explorer views should make the outputs feel like a real operating product rather than a single demo screen.
2. Scores should be categorized into severity tiers so results are scannable.
3. The product should gracefully handle missing local infrastructure by falling back to KV, Postgres, or in-memory persistence as available.

---

## 8. Experience Principles

1. **Show the work.**  
   The product should make agent behavior visible through activity events, sessions, and evidence-backed outputs.

2. **Stay grounded.**  
   When the system lacks evidence, it should say so instead of hallucinating confidence.

3. **Make setup lightweight.**  
   The path from empty state to first meaningful result should be short enough for a live demo.

4. **Prefer concrete over abstract.**  
   The experience should demonstrate the platform using real entities, real identifiers, and real retrieved context.

5. **Treat the compare view as a proof artifact.**  
   This is not just a feature; it is a distilled explanation of the whole product thesis.

---

## 9. Scope

### In Scope

- project-based entity monitoring,
- entity ingestion and resolution,
- four-agent runtime visualization,
- explicit explanation of MCP vs API roles in the architecture,
- credit-risk-oriented analysis and scoring,
- evidence-grounded question answering,
- raw vs grounded answer comparison,
- artifact views that make the workflow feel complete.

### Out of Scope

- full production-grade risk modeling,
- exhaustive analyst workflow replacement,
- custom customer integrations beyond Elemental and configured app storage,
- heavy historical backtesting,
- broad workflow automation outside the demonstration path.

This is a demo product meant to validate a product thesis, not a finished risk platform.

---

## 10. Success Criteria

The demo is successful if a stakeholder can use the app and come away believing all of the following:

1. **The system can take a messy monitoring scope and turn it into canonical monitored entities.**
2. **The multi-agent architecture is understandable and not merely decorative.**
3. **Elemental materially improves answer quality and trustworthiness.**
4. **The UI makes agentic work legible enough for real users to adopt.**
5. **This pattern could generalize beyond this specific FSI use case.**

---

## 11. Risks and Failure Modes

1. If entity resolution feels weak, the whole demo loses credibility because the foundation appears unreliable.
2. If the pipeline is invisible or too abstract, the app will look like a standard chat wrapper rather than an agent system.
3. If the compare view does not produce a meaningful difference between raw and grounded responses, the central thesis is weakened.
4. If outputs are not clearly tied to evidence, viewers may interpret the app as another generic AI demo.
5. If setup takes too long or the first-run path is confusing, the demo loses narrative momentum.

---

## 12. Future Evolution

If this demo succeeds, the natural next step is to evolve from a proof product into an operating system for monitored intelligence workflows:

- scheduled monitoring,
- richer alerting,
- deeper analytical modules,
- more artifact types,
- stronger human assessment loops,
- and broader domain coverage beyond FSI credit risk.

For now, the product should stay disciplined around its primary job:

**demonstrate that agent-first, evidence-grounded intelligence is more useful than ungrounded model interaction.**
