/**
 * Query Development Pipeline — Research Planner.
 *
 * Implements the Research Planner pattern from PRD_Query_Development.md
 * adapted for entity list building. Decomposes a research topic into
 * subthemes, signal hypotheses, and target entities via structured
 * Gemini function calling.
 */

import { generateContent, isGeminiConfigured } from './gemini';
import type { ResearchPlan, ResearchEntity } from './projectStore';

const TEMPLATE_PROMPTS: Record<string, string> = {
    sector_scan:
        'Focus on identifying the largest and most significant companies in this sector. ' +
        'Include both established leaders and fast-growing challengers. ' +
        'Rank by market presence, revenue, or total assets where applicable.',
    risk_screen:
        'Focus on companies exhibiting specific risk signals: high leverage, declining margins, ' +
        'executive turnover, regulatory actions, or deteriorating credit metrics. ' +
        'Include entities where risk indicators are emerging, not just confirmed.',
    peer_group:
        'Identify direct competitors and close peers. Include companies that compete in the same ' +
        'markets, serve similar customers, or offer substitute products/services. ' +
        'Consider both public and significant private competitors.',
    index_constituents:
        'List the constituent members of the specified index or benchmark. ' +
        'Use the most recent composition data available. ' +
        'Include ticker symbols for all entries.',
    event_driven:
        'Focus on companies affected by or involved in the specified event, regulation, or market ' +
        'development. Include direct participants and companies with significant indirect exposure. ' +
        "Note the nature of each entity's connection to the event.",
};

const SYSTEM_PROMPT = `You are a credit research planner specializing in entity discovery and competitive landscape mapping for financial services intelligence.

Your task is to decompose a research topic into a structured research plan that identifies specific entities (companies, organizations, people) relevant to the topic.

You MUST respond with ONLY valid JSON matching this exact schema (no markdown, no explanation):

{
  "topic_summary": "Refined 1-2 sentence description of the research scope",
  "subthemes": ["5-8 thematic angles to explore"],
  "adjacent_domains": ["3-5 related fields that may surface relevant entities"],
  "keywords": ["15-25 search terms relevant to the topic"],
  "signal_hypotheses": ["5-8 hypotheses about what risk/opportunity signals to look for"],
  "target_entities": [
    {
      "name": "Full legal entity name",
      "ticker": "TICK",
      "rationale": "One sentence explaining why this entity is relevant to the research topic"
    }
  ],
  "search_queries": ["18-25 structured web search queries for deeper research"],
  "coverage_notes": "Any caveats about completeness or known gaps"
}

Rules:
- target_entities should contain 8-20 entities depending on the scope
- Include ticker symbols when the entity is publicly traded
- Each entity MUST have a rationale explaining its relevance
- Prefer entities with verifiable identifiers (tickers, CIK numbers)
- search_queries should cover: startups (4+), market maps (3+), specific technologies (2+), academic research (2+), and edge/fringe sources (2+)
- Focus on the EDGES — emerging companies, unusual actors, experimental projects — not just mainstream names
`;

export async function runResearchPlanner(
    topic: string,
    options?: {
        context?: string;
        geography?: string;
        timeHorizon?: string;
        template?: string;
        maxEntities?: number;
    }
): Promise<ResearchPlan> {
    if (!isGeminiConfigured()) {
        throw new Error('NUXT_GEMINI_API_KEY not configured — cannot run research planner');
    }

    const templateExtra = options?.template ? TEMPLATE_PROMPTS[options.template] || '' : '';

    const parts = [
        `Research topic: "${topic}"`,
        options?.context ? `Additional context: ${options.context}` : '',
        options?.geography ? `Geographic focus: ${options.geography}` : '',
        options?.timeHorizon ? `Time horizon: ${options.timeHorizon}` : '',
        options?.maxEntities ? `Target entity count: ${options.maxEntities}` : '',
        templateExtra ? `\nTemplate guidance: ${templateExtra}` : '',
    ]
        .filter(Boolean)
        .join('\n');

    const response = await generateContent(parts, {
        systemInstruction: SYSTEM_PROMPT,
    });

    let parsed: any;
    try {
        const cleaned = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        parsed = JSON.parse(cleaned);
    } catch {
        parsed = {
            topic_summary: topic,
            subthemes: [],
            adjacent_domains: [],
            keywords: [],
            signal_hypotheses: [],
            target_entities: [],
            search_queries: [],
            coverage_notes: 'Failed to parse structured research plan from Gemini response.',
        };
    }

    const plan: ResearchPlan = {
        id: `rp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        projectId: '',
        topic,
        context: options?.context,
        geography: options?.geography,
        timeHorizon: options?.timeHorizon,
        template: options?.template,
        topicSummary: parsed.topic_summary || topic,
        subthemes: parsed.subthemes || [],
        adjacentDomains: parsed.adjacent_domains || [],
        keywords: parsed.keywords || [],
        signalHypotheses: parsed.signal_hypotheses || [],
        targetEntities: (parsed.target_entities || []).map((e: any) => ({
            name: e.name || '',
            ticker: e.ticker || undefined,
            rationale: e.rationale || '',
            selected: true,
        })),
        searchQueries: parsed.search_queries || [],
        coverageNotes: parsed.coverage_notes,
        createdAt: new Date().toISOString(),
    };

    return plan;
}

export function getAvailableTemplates(): { id: string; name: string; description: string }[] {
    return [
        {
            id: 'sector_scan',
            name: 'Sector Scan',
            description: 'Top N companies in a sector by size or metric',
        },
        {
            id: 'risk_screen',
            name: 'Risk Screen',
            description: 'Companies exhibiting specific risk indicators',
        },
        {
            id: 'peer_group',
            name: 'Peer Group',
            description: 'Direct competitors and close peers of a company',
        },
        {
            id: 'index_constituents',
            name: 'Index Constituents',
            description: 'Members of a specific index or benchmark',
        },
        {
            id: 'event_driven',
            name: 'Event-Driven',
            description: 'Companies affected by an event or regulation',
        },
    ];
}
