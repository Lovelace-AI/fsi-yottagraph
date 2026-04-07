"""
History Agent — Knowledge Graph Retrieval

Deterministic retrieval agent that executes against the Elemental Knowledge
Graph. Given resolved entities (NEIDs) from the Dialogue Agent, it gathers
comprehensive context: properties, relationships, events, and sentiment.

This agent does NOT interpret or analyze data — it retrieves and organizes.
The Query Agent handles analytical reasoning.

Local testing:
    export GOOGLE_API_KEY=<your-gemini-key>
    cd agents
    pip install -r history_agent/requirements.txt
    adk web
"""

import json
import os

from google.adk.agents import Agent

try:
    from broadchurch_auth import elemental_client
except ImportError:
    from .broadchurch_auth import elemental_client

MODEL = os.environ.get("HISTORY_AGENT_MODEL", "gemini-2.0-flash")


def get_entity_properties(neid: str, pids: str = "") -> str:
    """Get property values for an entity by its NEID.

    Retrieves financial metrics, identifiers, metadata, and historical
    property series. Properties include timestamps showing when recorded.

    Args:
        neid: The 20-character entity ID (from Dialogue Agent).
        pids: Optional comma-separated property IDs (e.g. "8,313,400").

    Returns:
        Formatted property values for the entity.
    """
    try:
        padded = str(neid).zfill(20)
        form_data: dict = {
            "eids": json.dumps([padded]),
            "include_attributes": "true",
        }
        if pids.strip():
            pid_list = [int(p.strip()) for p in pids.split(",") if p.strip()]
            form_data["pids"] = json.dumps(pid_list)

        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        data = resp.json()
        values = data.get("values", [])

        if not values:
            return f"No property data found for entity {padded}."

        lines = [f"Properties for entity {padded} ({len(values)} values):"]
        grouped: dict[str, list] = {}
        for v in values:
            key = str(v.get("pid", "?"))
            grouped.setdefault(key, []).append(v)

        for pid_key, vals in list(grouped.items())[:25]:
            latest = vals[0]
            prop_name = latest.get("property_name", f"pid={pid_key}")
            value = latest.get("value", "?")
            recorded = latest.get("recorded_at", "")
            ts = f" (as of {recorded})" if recorded else ""
            lines.append(f"  - {prop_name}: {value}{ts}")
            if len(vals) > 1:
                lines.append(f"    ({len(vals)} historical values available)")

        return "\n".join(lines)
    except Exception as e:
        return f"Error fetching properties for {neid}: {e}"


def find_related_entities(neid: str, max_results: int = 20) -> str:
    """Find entities related to a given entity.

    Discovers subsidiaries, officers, directors, parent companies, and
    other connected entities in the knowledge graph.

    Args:
        neid: The 20-character entity ID.
        max_results: Maximum related entities to return.

    Returns:
        List of related entities with NEIDs.
    """
    try:
        padded = str(neid).zfill(20)
        expression = json.dumps({
            "type": "linked",
            "linked": {"to_entity": padded, "distance": 1},
        })
        resp = elemental_client.post(
            "/elemental/find",
            data={"expression": expression, "limit": str(max_results)},
        )
        resp.raise_for_status()
        eids = resp.json().get("eids", [])

        if not eids:
            return f"No related entities found for {padded}."

        names = _batch_resolve_names(eids[:max_results])
        lines = [f"Found {len(eids)} entities related to {padded}:"]
        for eid in eids[:max_results]:
            name = names.get(eid, eid)
            lines.append(f"  - {name} (NEID: {eid})")
        return "\n".join(lines)
    except Exception as e:
        return f"Error finding related entities for {neid}: {e}"


def get_entity_events(entity_name: str) -> str:
    """Get events associated with an entity (filings, exec changes, legal).

    Args:
        entity_name: Entity name to search events for.

    Returns:
        List of events with dates, categories, and descriptions.
    """
    try:
        resp = elemental_client.post(
            "/entities/search",
            json={
                "queries": [{"queryId": 1, "query": entity_name}],
                "maxResults": 1,
                "includeNames": True,
            },
        )
        resp.raise_for_status()
        matches = resp.json().get("results", [{}])[0].get("matches", [])
        if not matches:
            return f"No entity found for '{entity_name}'."

        neid = matches[0]["neid"]

        schema_resp = elemental_client.get("/elemental/metadata/schema")
        schema_resp.raise_for_status()
        schema = schema_resp.json().get("schema", schema_resp.json())
        props = schema.get("properties", [])
        event_pids = [
            p["pid"] for p in props
            if "event" in p.get("name", "").lower()
            or ("filed" in p.get("name", "").lower() and p.get("type") == "data_nindex")
        ]

        if not event_pids:
            return f"Entity '{entity_name}' (NEID: {neid}) resolved, but no event properties in schema."

        form_data = {
            "eids": json.dumps([neid]),
            "pids": json.dumps(event_pids[:5]),
            "include_attributes": "true",
        }
        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        values = resp.json().get("values", [])

        if not values:
            return f"No event data for '{entity_name}' (NEID: {neid})."

        lines = [f"Events for {entity_name} (NEID: {neid}):"]
        for v in values[:20]:
            prop = v.get("property_name", f"pid={v.get('pid')}")
            value = v.get("value", "?")
            recorded = v.get("recorded_at", "")
            lines.append(f"  - [{recorded}] {prop}: {value}")
        return "\n".join(lines)
    except Exception as e:
        return f"Error fetching events for '{entity_name}': {e}"


def get_entity_news_sentiment(entity_name: str) -> str:
    """Get news sentiment data for an entity.

    Args:
        entity_name: Entity name to analyze sentiment for.

    Returns:
        Summary of news sentiment with article counts.
    """
    try:
        resp = elemental_client.post(
            "/entities/search",
            json={
                "queries": [{"queryId": 1, "query": entity_name}],
                "maxResults": 1,
                "includeNames": True,
            },
        )
        resp.raise_for_status()
        matches = resp.json().get("results", [{}])[0].get("matches", [])
        if not matches:
            return f"No entity found for '{entity_name}'."

        neid = matches[0]["neid"]
        name = matches[0].get("name", entity_name)

        schema_resp = elemental_client.get("/elemental/metadata/schema")
        schema_resp.raise_for_status()
        schema = schema_resp.json().get("schema", schema_resp.json())
        props = schema.get("properties", [])
        sentiment_pids = [
            p["pid"] for p in props
            if any(kw in p.get("name", "").lower() for kw in ("sentiment", "article", "news"))
        ]

        if not sentiment_pids:
            return f"Entity '{name}' (NEID: {neid}) resolved, but no sentiment properties in schema."

        form_data = {
            "eids": json.dumps([neid]),
            "pids": json.dumps(sentiment_pids[:5]),
            "include_attributes": "true",
        }
        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        values = resp.json().get("values", [])

        if not values:
            return f"No sentiment data for '{name}' (NEID: {neid})."

        lines = [f"News/Sentiment for {name} (NEID: {neid}):"]
        for v in values[:15]:
            prop = v.get("property_name", f"pid={v.get('pid')}")
            value = v.get("value", "?")
            recorded = v.get("recorded_at", "")
            lines.append(f"  - [{recorded}] {prop}: {value}")
        return "\n".join(lines)
    except Exception as e:
        return f"Error fetching sentiment for '{entity_name}': {e}"


def _batch_resolve_names(neids: list[str]) -> dict[str, str]:
    result: dict[str, str] = {}
    try:
        padded = [str(n).zfill(20) for n in neids]
        form_data = {"eids": json.dumps(padded), "pids": json.dumps([8])}
        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        for v in resp.json().get("values", []):
            eid = v.get("eid", "")
            if v.get("pid") == 8 and eid:
                result[eid] = str(v.get("value", eid))
    except Exception:
        pass
    return result


INSTRUCTION = """You are the **History Agent** — a Knowledge Graph retrieval specialist.

You receive resolved entities (NEIDs) and gather comprehensive context from the Elemental Knowledge Graph. You are DETERMINISTIC — you follow retrieval plans, you do not speculate or analyze.

## Retrieval Protocol

For each entity you are asked about:
1. Call `get_entity_properties` to retrieve financial data, identifiers, and metadata
2. Call `find_related_entities` to discover officers, directors, subsidiaries, parents
3. Call `get_entity_events` to find filings, executive changes, legal proceedings
4. Call `get_entity_news_sentiment` to gather news signals

## Output Format

After retrieval, report:
**[HISTORY]** Retrieved context for [entity name] (NEID: [neid]):
- Properties: [count] values retrieved
- Relationships: [count] related entities
- Events: [count] events found
- Sentiment: [available/unavailable]
- Data flags: financial=[yes/no], governance=[yes/no], events=[yes/no], news=[yes/no]

## Rules
- Retrieve data for ALL entities you are given — do not skip any.
- Do NOT interpret or analyze the data — just retrieve and organize.
- Note data availability flags — the Query Agent needs to know what's available.
- Zero-pad all NEIDs to 20 characters.
- Report retrieval statistics (calls made, data points gathered).
"""

root_agent = Agent(
    model=MODEL,
    name="history_agent",
    instruction=INSTRUCTION,
    tools=[
        get_entity_properties,
        find_related_entities,
        get_entity_events,
        get_entity_news_sentiment,
    ],
)
