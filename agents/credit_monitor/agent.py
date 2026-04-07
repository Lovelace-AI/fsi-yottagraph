"""
Credit Monitor Agent — Agent-first FSI credit risk monitoring.

A multi-agent pipeline that reasons with Gemini over Elemental knowledge graph
data to produce evidence-backed credit risk assessments.

Pipeline: Dialogue → History → Query → Composition

The root agent orchestrates the 4-phase pipeline. Sub-agents specialize in
entity resolution (Dialogue), data retrieval (History), analytical reasoning
(Query), and output formatting (Composition).

Local testing:
    export GOOGLE_API_KEY=<your-gemini-key>
    cd agents
    pip install -r credit_monitor/requirements.txt
    adk web

Deployment:
    Use /deploy_agent or trigger deploy-agent.yml.
"""

import os

from google.adk.agents import Agent

from .prompts import (
    ORCHESTRATOR_INSTRUCTION,
    DIALOGUE_INSTRUCTION,
    HISTORY_INSTRUCTION,
    QUERY_INSTRUCTION,
    COMPOSITION_INSTRUCTION,
)
from .tools.elemental import (
    lookup_entity,
    get_schema,
    get_entity_properties,
    find_related_entities,
    get_entity_events,
    get_entity_news_sentiment,
)
from .tools.scoring import (
    compute_financial_ratios,
    compute_executive_risk_score,
)

MODEL = os.environ.get("CREDIT_MONITOR_MODEL", "gemini-2.0-flash")

dialogue_agent = Agent(
    model=MODEL,
    name="dialogue_agent",
    description=(
        "Resolves ambiguous user requests into precise retrieval plans. "
        "Handles entity name resolution, temporal context, scope, and intent classification. "
        "Delegate to this agent when the user asks a question that needs entity resolution "
        "or when the request is ambiguous."
    ),
    instruction=DIALOGUE_INSTRUCTION,
    tools=[lookup_entity, get_schema],
)

history_agent = Agent(
    model=MODEL,
    name="history_agent",
    description=(
        "Retrieves comprehensive context from the Elemental knowledge graph. "
        "Gathers entity properties, relationships, events, and sentiment data. "
        "Delegate to this agent after entity resolution to gather data."
    ),
    instruction=HISTORY_INSTRUCTION,
    tools=[
        get_entity_properties,
        find_related_entities,
        get_entity_events,
        get_entity_news_sentiment,
        get_schema,
    ],
)

query_agent = Agent(
    model=MODEL,
    name="query_agent",
    description=(
        "Performs analytical reasoning over retrieved context. "
        "Computes Financial Health Scores (FHS) and Executive Risk Scores (ERS). "
        "Delegate to this agent after data retrieval to produce risk assessments."
    ),
    instruction=QUERY_INSTRUCTION,
    tools=[compute_financial_ratios, compute_executive_risk_score],
)

composition_agent = Agent(
    model=MODEL,
    name="composition_agent",
    description=(
        "Formats analytical results for the appropriate output surface. "
        "Handles entity profiles, risk cards, signal deltas, and narrative reports. "
        "Delegate to this agent after analysis to produce formatted output."
    ),
    instruction=COMPOSITION_INSTRUCTION,
    tools=[],
)

root_agent = Agent(
    model=MODEL,
    name="credit_monitor",
    instruction=ORCHESTRATOR_INSTRUCTION,
    sub_agents=[dialogue_agent, history_agent, query_agent, composition_agent],
    tools=[
        lookup_entity,
        get_schema,
        get_entity_properties,
        find_related_entities,
        get_entity_events,
        get_entity_news_sentiment,
        compute_financial_ratios,
        compute_executive_risk_score,
    ],
)
