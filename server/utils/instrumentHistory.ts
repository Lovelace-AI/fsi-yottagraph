import type { ProjectEntity } from './projectStore';
import { queryDeployedAgentJson } from './agentRuntime';

export interface InstrumentHistoryEntry {
    value: string;
    effectiveFrom: string;
    lastSeenAt: string;
    ref?: string;
}

export interface InstrumentPredecessor {
    neid: string;
    name?: string;
    effectiveFrom: string;
    lastSeenAt: string;
}

export interface InstrumentHistorySnapshot {
    tickerSymbolHistory: InstrumentHistoryEntry[];
    exchangeHistory: InstrumentHistoryEntry[];
    companyNameHistory: InstrumentHistoryEntry[];
    securityTypeHistory: InstrumentHistoryEntry[];
    predecessorInstruments: InstrumentPredecessor[];
}

function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

interface InstrumentHistoryAgentResult {
    neid: string;
    tickerSymbolHistory?: InstrumentHistoryEntry[];
    exchangeHistory?: InstrumentHistoryEntry[];
    companyNameHistory?: InstrumentHistoryEntry[];
    securityTypeHistory?: InstrumentHistoryEntry[];
    predecessorInstruments?: InstrumentPredecessor[];
}

interface InstrumentHistoryAgentJson {
    results?: InstrumentHistoryAgentResult[];
}

function buildInstrumentHistoryPrompt(entities: ProjectEntity[]): string {
    const inputs = entities.map((entity) => ({
        neid: entity.neid,
        name: entity.name,
        ticker: entity.ticker || '',
        exchange: entity.exchange || '',
    }));

    return `You are the History Agent for an equity watchlist import.
Use MCP tools to retrieve trading identity history for each financial instrument below.

For each instrument:
- retrieve historical values for ticker_symbol
- retrieve historical values for exchange
- retrieve historical values for company_name
- retrieve historical values for security_type
- retrieve predecessor instrument lineage if available

Input instruments:
${JSON.stringify(inputs, null, 2)}

Return ONLY valid JSON with this exact shape:
{
  "results": [
    {
      "neid": "20-digit neid",
      "tickerSymbolHistory": [
        {
          "value": "AAPL",
          "effectiveFrom": "2026-03-10T04:00:00Z",
          "lastSeenAt": "2026-04-08T04:00:00Z",
          "ref": "optional_ref"
        }
      ],
      "exchangeHistory": [
        {
          "value": "NASDAQ",
          "effectiveFrom": "2026-03-10T04:00:00Z",
          "lastSeenAt": "2026-04-08T04:00:00Z",
          "ref": "optional_ref"
        }
      ],
      "companyNameHistory": [],
      "securityTypeHistory": [],
      "predecessorInstruments": [
        {
          "neid": "20-digit neid",
          "name": "optional predecessor name",
          "effectiveFrom": "2025-01-01T00:00:00Z",
          "lastSeenAt": "2025-06-01T00:00:00Z"
        }
      ]
    }
  ]
}

Rules:
- Preserve input ordering.
- Use empty arrays when no data is available.
- Never invent dates, refs, or predecessor instruments.
- Prefer MCP-backed historical_properties and relationship traversal over summaries.`;
}

export async function hydrateFinancialInstrumentEntities(
    entities: ProjectEntity[]
): Promise<ProjectEntity[]> {
    const financialInstruments = entities.filter(
        (entity) => entity.entityType === 'financial_instrument'
    );
    if (financialInstruments.length === 0) return entities;

    const historyByNeid = new Map<string, InstrumentHistoryAgentResult>();

    for (const instrumentChunk of chunk(financialInstruments, 10)) {
        const { json } = await queryDeployedAgentJson<InstrumentHistoryAgentJson>(
            ['history_agent', 'credit_monitor', 'query_agent'],
            buildInstrumentHistoryPrompt(instrumentChunk)
        );

        for (const result of json?.results || []) {
            if (!result?.neid) continue;
            historyByNeid.set(result.neid, result);
        }
    }

    return entities.map((entity) => {
        if (entity.entityType !== 'financial_instrument') return entity;
        const history = historyByNeid.get(entity.neid);
        if (!history) return entity;

        const latestTicker =
            history.tickerSymbolHistory?.[history.tickerSymbolHistory.length - 1]?.value;
        const latestExchange = history.exchangeHistory?.[history.exchangeHistory.length - 1]?.value;
        const latestSecurityType =
            history.securityTypeHistory?.[history.securityTypeHistory.length - 1]?.value;

        return {
            ...entity,
            ticker: entity.ticker || latestTicker,
            exchange: entity.exchange || latestExchange,
            securityType: entity.securityType || latestSecurityType,
            instrumentHistory: {
                tickerSymbolHistory: history.tickerSymbolHistory || [],
                exchangeHistory: history.exchangeHistory || [],
                companyNameHistory: history.companyNameHistory || [],
                securityTypeHistory: history.securityTypeHistory || [],
                predecessorInstruments: history.predecessorInstruments || [],
            },
        };
    });
}
