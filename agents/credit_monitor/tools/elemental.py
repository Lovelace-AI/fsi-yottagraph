"""
Elemental API tools for the Credit Monitor agent.

Each tool returns a formatted string (not raw JSON) so the LLM can
interpret results directly. All exceptions are caught and returned as
error strings per ADK best practices.
"""

import json

try:
    from broadchurch_auth import elemental_client
except ImportError:
    from ..broadchurch_auth import elemental_client


def lookup_entity(name: str) -> str:
    """Look up an entity by name (company, person, organization).

    Use this to resolve a human-readable name to a unique NEID (entity ID).
    Returns ranked matches with NEIDs, names, types, and confidence scores.

    Args:
        name: Entity name to search for (e.g. "Apple", "JPMorgan Chase", "Elon Musk").

    Returns:
        Formatted search results with NEIDs and entity types.
    """
    try:
        resp = elemental_client.post(
            "/entities/search",
            json={
                "queries": [{"queryId": 1, "query": name}],
                "maxResults": 5,
                "includeNames": True,
                "includeFlavors": True,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results or not results[0].get("matches"):
            return f"No entities found matching '{name}'."

        matches = results[0]["matches"]
        lines = []
        for m in matches[:5]:
            flavor = m.get("flavor", "unknown")
            score = m.get("score", 0)
            lines.append(
                f"- {m.get('name', '?')} | NEID: {m['neid']} | Type: {flavor} | Score: {score:.2f}"
            )
        return f"Found {len(matches)} result(s) for '{name}':\n" + "\n".join(lines)
    except Exception as e:
        return f"Error looking up '{name}': {e}"


def get_schema() -> str:
    """Get the knowledge graph schema — available entity types and properties.

    Call this to discover what kinds of entities exist (companies, people,
    financial instruments, etc.) and what properties they have (name, country,
    industry, leverage_ratio, etc.).

    Returns:
        List of entity types (flavors) with their IDs, and key property IDs.
    """
    try:
        resp = elemental_client.get("/elemental/metadata/schema")
        resp.raise_for_status()
        data = resp.json()
        schema = data.get("schema", data)
        flavors = schema.get("flavors", [])
        properties = schema.get("properties", [])

        flavor_lines = []
        for f in flavors[:30]:
            fid = f.get("fid", f.get("findex", "?"))
            flavor_lines.append(f"  - {f.get('name', '?')} (fid={fid})")

        prop_lines = []
        for p in properties[:40]:
            prop_lines.append(
                f"  - {p.get('name', '?')} (pid={p.get('pid', '?')}, type={p.get('type', '?')})"
            )

        return (
            f"Schema: {len(flavors)} entity types, {len(properties)} properties\n\n"
            f"Entity types:\n" + "\n".join(flavor_lines) + "\n\n"
            f"Key properties:\n" + "\n".join(prop_lines)
        )
    except Exception as e:
        return f"Error fetching schema: {e}"


def get_entity_properties(neid: str, pids: str = "") -> str:
    """Get property values for an entity by its NEID.

    Retrieves detailed property data including financial metrics, identifiers,
    and metadata. Properties are returned with timestamps showing when each
    value was recorded.

    Args:
        neid: The 20-character entity ID (from lookup_entity).
        pids: Optional comma-separated property IDs to retrieve (e.g. "8,313,400").
              If empty, retrieves commonly useful properties.

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
            pid = v.get("pid", "?")
            key = str(pid)
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
    """Find entities related to a given entity (subsidiaries, officers, directors, etc.).

    Uses the knowledge graph to find entities connected by relationships
    like officer_of, director_of, subsidiary_of, etc.

    Args:
        neid: The 20-character entity ID.
        max_results: Maximum number of related entities to return.

    Returns:
        List of related entities with relationship types.
    """
    try:
        padded = str(neid).zfill(20)
        expression = json.dumps(
            {
                "type": "linked",
                "linked": {
                    "to_entity": padded,
                    "distance": 1,
                },
            }
        )
        resp = elemental_client.post(
            "/elemental/find",
            data={"expression": expression, "limit": str(max_results)},
        )
        resp.raise_for_status()
        data = resp.json()
        eids = data.get("eids", [])

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
    """Get recent events associated with an entity.

    Retrieves events like SEC filings, executive changes, mergers,
    legal proceedings, and other significant corporate events.

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
        search_data = resp.json()
        matches = search_data.get("results", [{}])[0].get("matches", [])
        if not matches:
            return f"No entity found for '{entity_name}' to fetch events."

        neid = matches[0]["neid"]

        schema_resp = elemental_client.get("/elemental/metadata/schema")
        schema_resp.raise_for_status()
        schema = schema_resp.json().get("schema", schema_resp.json())
        props = schema.get("properties", [])
        event_pids = [
            p["pid"] for p in props if "event" in p.get("name", "").lower()
        ]

        if not event_pids:
            event_pids = [
                p["pid"]
                for p in props
                if p.get("type") == "data_nindex" and "filed" in p.get("name", "").lower()
            ]

        if not event_pids:
            return (
                f"Entity '{entity_name}' resolved to NEID {neid}, "
                f"but no event-type properties found in schema."
            )

        form_data = {
            "eids": json.dumps([neid]),
            "pids": json.dumps(event_pids[:5]),
            "include_attributes": "true",
        }
        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        values = resp.json().get("values", [])

        if not values:
            return f"No event data found for '{entity_name}' (NEID: {neid})."

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

    Searches for recent news articles mentioning the entity and
    analyzes sentiment trends.

    Args:
        entity_name: Entity name to analyze sentiment for.

    Returns:
        Summary of news sentiment with article counts and trends.
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
            return f"No entity found for '{entity_name}' to analyze sentiment."

        neid = matches[0]["neid"]
        name = matches[0].get("name", entity_name)

        schema_resp = elemental_client.get("/elemental/metadata/schema")
        schema_resp.raise_for_status()
        schema = schema_resp.json().get("schema", schema_resp.json())
        props = schema.get("properties", [])
        sentiment_pids = [
            p["pid"]
            for p in props
            if "sentiment" in p.get("name", "").lower()
            or "article" in p.get("name", "").lower()
            or "news" in p.get("name", "").lower()
        ]

        if not sentiment_pids:
            return (
                f"Entity '{name}' (NEID: {neid}) resolved successfully, "
                f"but no sentiment/news properties found in schema. "
                f"The knowledge graph may not have news data for this entity."
            )

        form_data = {
            "eids": json.dumps([neid]),
            "pids": json.dumps(sentiment_pids[:5]),
            "include_attributes": "true",
        }
        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        values = resp.json().get("values", [])

        if not values:
            return f"No sentiment data available for '{name}' (NEID: {neid})."

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
    """Resolve a batch of NEIDs to display names."""
    result: dict[str, str] = {}
    try:
        padded = [str(n).zfill(20) for n in neids]
        form_data = {
            "eids": json.dumps(padded),
            "pids": json.dumps([8]),
        }
        resp = elemental_client.post("/elemental/entities/properties", data=form_data)
        resp.raise_for_status()
        for v in resp.json().get("values", []):
            eid = v.get("eid", "")
            if v.get("pid") == 8 and eid:
                result[eid] = str(v.get("value", eid))
    except Exception:
        pass
    return result
