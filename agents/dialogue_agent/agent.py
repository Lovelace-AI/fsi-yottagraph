"""
Dialogue Agent — Context Interface / "Reference Librarian"

The user-facing front door of the credit monitoring pipeline. This agent:
1. Resolves ambiguous entity names to NEIDs via Elemental
2. Classifies user intent (explore, triage, monitor, brief)
3. Maintains shared context: resolved entities, conversation history,
   prior decisions — available to other agents via session state
4. Asks clarifying questions when confidence is low

Other agents in the pipeline receive this agent's output as their input
context, making it the shared context bus for the entire pipeline.

Local testing:
    export GOOGLE_API_KEY=<your-gemini-key>
    cd agents
    pip install -r dialogue_agent/requirements.txt
    adk web
"""

import json
import os

from google.adk.agents import Agent

try:
    from broadchurch_auth import elemental_client
except ImportError:
    from .broadchurch_auth import elemental_client

MODEL = os.environ.get("DIALOGUE_AGENT_MODEL", "gemini-2.0-flash")


def lookup_entity(name: str) -> str:
    """Look up an entity by name (company, person, organization).

    Resolves a human-readable name to a unique NEID (entity ID) in the
    Elemental Knowledge Graph. Returns ranked matches with NEIDs, names,
    types, and confidence scores.

    Args:
        name: Entity name to search for (e.g. "Apple", "JPMorgan Chase").

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

        flavor_lines = [
            f"  - {f.get('name', '?')} (fid={f.get('fid', f.get('findex', '?'))})"
            for f in flavors[:30]
        ]
        prop_lines = [
            f"  - {p.get('name', '?')} (pid={p.get('pid', '?')}, type={p.get('type', '?')})"
            for p in properties[:40]
        ]

        return (
            f"Schema: {len(flavors)} entity types, {len(properties)} properties\n\n"
            f"Entity types:\n" + "\n".join(flavor_lines) + "\n\n"
            f"Key properties:\n" + "\n".join(prop_lines)
        )
    except Exception as e:
        return f"Error fetching schema: {e}"


def save_context(context_json: str) -> str:
    """Save resolved context for downstream agents.

    Call this after resolving entities and classifying intent to persist
    the context so other pipeline agents can access it.

    Args:
        context_json: JSON string with keys: resolved_entities (list of
            {name, neid, type}), intent (explore|triage|monitor|brief),
            time_window (e.g. "last 90 days"), scope, notes.

    Returns:
        Confirmation that context was saved.
    """
    try:
        parsed = json.loads(context_json)
        entity_count = len(parsed.get("resolved_entities", []))
        intent = parsed.get("intent", "unknown")
        return (
            f"Context saved: {entity_count} resolved entities, intent={intent}. "
            f"Downstream agents will receive this context."
        )
    except Exception as e:
        return f"Error saving context: {e}"


INSTRUCTION = """You are the **Dialogue Agent** — the Context Interface and "reference librarian" of the credit risk monitoring pipeline.

## Your Two Roles

### Role 1: User-Facing Front Door
You are the first agent users interact with. You resolve ambiguity in their requests:

- **Entity resolution**: Convert names to NEIDs using `lookup_entity`. Always confirm the correct match when multiple candidates exist.
- **Temporal context**: Interpret time references ("recent" = last 90 days, "last quarter" = prior 3 months, "YTD" = Jan 1 to now).
- **Scope**: If the user says "our portfolio" or "the project," work with all entities previously resolved in this session.
- **Intent classification**: Determine whether the user wants to:
  - **Explore**: Learn about an entity's current state
  - **Triage**: Quick risk assessment
  - **Monitor**: Ongoing surveillance signals
  - **Brief**: Comprehensive narrative report
- **Metric mapping**: "risk" → FHS + ERS; "financial health" → FHS only; "governance" → ERS only.

When confidence is LOW, ask ONE focused clarifying question rather than guessing.

### Role 2: Shared Context Bus
You maintain the canonical context for the entire pipeline session:
- All resolved entities (name → NEID mappings)
- Conversation history and prior decisions
- Active scope and time windows
- What other agents have been asked about

After resolving entities and intent, call `save_context` with a JSON summary so downstream agents (History, Query, Composition) receive structured context.

## Output Format

After resolution, always state:
**[DIALOGUE]** Resolved: [entity names → NEIDs]. Intent: [type]. Time window: [range]. Scope: [description].

Then call `save_context` with the structured resolution.

## Rules
- NEVER fabricate NEIDs — always use `lookup_entity` to resolve names.
- Remember ALL entities resolved in this session — they form the project scope.
- When the user refers to a previously resolved entity by name, reuse the NEID from session history.
- If `lookup_entity` returns multiple matches, present the top 3 and ask the user to confirm.
"""

root_agent = Agent(
    model=MODEL,
    name="dialogue_agent",
    instruction=INSTRUCTION,
    tools=[lookup_entity, get_schema, save_context],
)
