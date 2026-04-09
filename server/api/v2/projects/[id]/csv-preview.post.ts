import { resolveBatchAgentFirst, type EntityTypeHint } from '~/server/utils/agentResolution';
import { generateContent, isGeminiConfigured } from '~/server/utils/gemini';

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseRow = (line: string): string[] => {
        const cells: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                cells.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        cells.push(current.trim());
        return cells;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
}

interface ExtractedEntity {
    name: string;
    ticker?: string;
    cik?: string;
    lei?: string;
    ein?: string;
    cusip?: string;
    figi?: string;
    isin?: string;
    entityTypeHint?: EntityTypeHint;
    secondaryEntityTypeHint?: EntityTypeHint;
}

interface ColumnMapping {
    name: string | null;
    cik: string | null;
    ticker: string | null;
    lei: string | null;
    ein: string | null;
    cusip: string | null;
    figi: string | null;
    isin: string | null;
    primaryEntityHint: string | null;
    secondaryEntityHint: string | null;
}

function normalizeEntityTypeHint(value: string | undefined): EntityTypeHint | undefined {
    const normalized = (value || '').trim().toLowerCase();
    if (!normalized) return undefined;
    if (
        ['organization', 'org', 'company', 'issuer', 'corporation', 'business'].includes(normalized)
    ) {
        return 'organization';
    }
    if (
        [
            'financial_instrument',
            'financial instrument',
            'instrument',
            'stock',
            'security',
            'equity',
        ].includes(normalized)
    ) {
        return 'financial_instrument';
    }
    if (['person', 'individual', 'officer', 'director', 'executive'].includes(normalized)) {
        return 'person';
    }
    return undefined;
}

function detectHintColumns(
    headers: string[]
): Pick<ColumnMapping, 'primaryEntityHint' | 'secondaryEntityHint'> {
    return {
        primaryEntityHint:
            headers.find((h) =>
                /^(primary\s+entity\s+hint|entity\s+hint|entity\s+type|flavor)$/i.test(h.trim())
            ) || null,
        secondaryEntityHint:
            headers.find((h) =>
                /^(secondary\s+entity\s+hint|secondary\s+entity\s+type|paired\s+entity\s+hint)$/i.test(
                    h.trim()
                )
            ) || null,
    };
}

async function geminiInterpretColumns(
    headers: string[],
    sampleRows: string[][]
): Promise<{ mapping: ColumnMapping; explanation: string }> {
    const sampleText = [headers.join(','), ...sampleRows.slice(0, 5).map((r) => r.join(','))].join(
        '\n'
    );

    const prompt = `You are given a CSV with these headers and sample rows:

\`\`\`
${sampleText}
\`\`\`

Analyze the headers and sample data to determine which column contains what type of data. Map each relevant column to one of these identifier types:

- **name**: The primary entity name (company, person, organization, issuer, borrower, counterparty, obligor, etc.)
- **cik**: SEC Central Index Key (7-10 digit number)
- **ticker**: Stock ticker / symbol (1-5 uppercase letters)
- **lei**: Legal Entity Identifier (20 alphanumeric chars)
- **ein**: Employer Identification Number (XX-XXXXXXX)
- **cusip**: Security identifier (9 chars)
- **figi**: Financial Instrument Global Identifier (12 chars, starts with BBG)
- **isin**: International Securities ID (12 chars)
- **primaryEntityHint**: Optional flavor hint column such as organization, financial_instrument, or person
- **secondaryEntityHint**: Optional paired flavor hint column such as financial_instrument or organization

Return ONLY valid JSON (no markdown):
{
  "column_interpretation": "One sentence describing what this CSV contains",
  "mapping": {
    "name": "exact header name that contains entity names, or null",
    "cik": "exact header name or null",
    "ticker": "exact header name or null",
    "lei": "exact header name or null",
    "ein": "exact header name or null",
    "cusip": "exact header name or null",
    "figi": "exact header name or null",
    "isin": "exact header name or null",
    "primaryEntityHint": "exact header name or null",
    "secondaryEntityHint": "exact header name or null"
  }
}

Use the EXACT header strings from the CSV. Set to null if no column matches that type.`;

    const response = await generateContent(prompt, {
        systemInstruction:
            'You analyze CSV column headers to identify entity identifiers. Return only valid JSON with exact header names.',
    });

    try {
        const cleaned = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
        const parsed = JSON.parse(cleaned);
        const hintColumns = detectHintColumns(headers);
        const mapping: ColumnMapping = {
            name: parsed.mapping?.name || null,
            cik: parsed.mapping?.cik || null,
            ticker: parsed.mapping?.ticker || null,
            lei: parsed.mapping?.lei || null,
            ein: parsed.mapping?.ein || null,
            cusip: parsed.mapping?.cusip || null,
            figi: parsed.mapping?.figi || null,
            isin: parsed.mapping?.isin || null,
            primaryEntityHint:
                parsed.mapping?.primaryEntityHint || hintColumns.primaryEntityHint || null,
            secondaryEntityHint:
                parsed.mapping?.secondaryEntityHint || hintColumns.secondaryEntityHint || null,
        };
        const detected = Object.entries(mapping)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}="${v}"`)
            .join(', ');
        return {
            mapping,
            explanation: `${parsed.column_interpretation || 'CSV analyzed.'} Detected columns: ${detected}`,
        };
    } catch {
        return {
            mapping: {
                name: null,
                cik: null,
                ticker: null,
                lei: null,
                ein: null,
                cusip: null,
                figi: null,
                isin: null,
                primaryEntityHint: null,
                secondaryEntityHint: null,
            },
            explanation: 'Failed to parse Gemini column analysis.',
        };
    }
}

function extractEntitiesFromRows(
    headers: string[],
    rows: string[][],
    mapping: ColumnMapping
): ExtractedEntity[] {
    const colIdx = (headerName: string | null): number =>
        headerName ? headers.findIndex((h) => h === headerName) : -1;

    const nameIdx = colIdx(mapping.name);
    const tickerIdx = colIdx(mapping.ticker);
    const cikIdx = colIdx(mapping.cik);
    const leiIdx = colIdx(mapping.lei);
    const einIdx = colIdx(mapping.ein);
    const cusipIdx = colIdx(mapping.cusip);
    const figiIdx = colIdx(mapping.figi);
    const isinIdx = colIdx(mapping.isin);
    const primaryHintIdx = colIdx(mapping.primaryEntityHint);
    const secondaryHintIdx = colIdx(mapping.secondaryEntityHint);

    if (nameIdx === -1) return [];

    return rows
        .map((row) => ({
            name: (row[nameIdx] || '').trim(),
            ticker: tickerIdx >= 0 ? (row[tickerIdx] || '').trim() || undefined : undefined,
            cik: cikIdx >= 0 ? (row[cikIdx] || '').trim() || undefined : undefined,
            lei: leiIdx >= 0 ? (row[leiIdx] || '').trim() || undefined : undefined,
            ein: einIdx >= 0 ? (row[einIdx] || '').trim() || undefined : undefined,
            cusip: cusipIdx >= 0 ? (row[cusipIdx] || '').trim() || undefined : undefined,
            figi: figiIdx >= 0 ? (row[figiIdx] || '').trim() || undefined : undefined,
            isin: isinIdx >= 0 ? (row[isinIdx] || '').trim() || undefined : undefined,
            entityTypeHint:
                primaryHintIdx >= 0
                    ? normalizeEntityTypeHint((row[primaryHintIdx] || '').trim())
                    : undefined,
            secondaryEntityTypeHint:
                secondaryHintIdx >= 0
                    ? normalizeEntityTypeHint((row[secondaryHintIdx] || '').trim())
                    : undefined,
        }))
        .filter((e) => e.name);
}

export default defineEventHandler(async (event) => {
    const body = await readBody<{
        csvText: string;
        resolve?: boolean;
        desiredEntityType?: EntityTypeHint | 'auto';
    }>(event);

    if (!body?.csvText?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'csvText is required' });
    }

    const { headers, rows } = parseCsv(body.csvText);
    if (headers.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'No valid CSV headers found' });
    }

    let entities: ExtractedEntity[] = [];
    let explanation = '';

    if (isGeminiConfigured()) {
        // Step 1: Gemini figures out which columns map to what (fast, only needs headers + sample)
        const { mapping, explanation: interp } = await geminiInterpretColumns(headers, rows);
        explanation = interp;
        // Step 2: Programmatically extract ALL rows using the mapping
        entities = extractEntitiesFromRows(headers, rows, mapping);
    } else {
        // Fallback: regex-based column detection
        const fallbackMapping: ColumnMapping = {
            name:
                headers.find((h) =>
                    /^(name|company|entity|issuer|borrower|obligor)/i.test(h.trim())
                ) || null,
            ticker: headers.find((h) => /^(ticker|symbol)/i.test(h.trim())) || null,
            cik: headers.find((h) => /^cik/i.test(h.trim())) || null,
            lei: headers.find((h) => /^lei/i.test(h.trim())) || null,
            ein: headers.find((h) => /^ein/i.test(h.trim())) || null,
            cusip: headers.find((h) => /^cusip/i.test(h.trim())) || null,
            figi: headers.find((h) => /^figi/i.test(h.trim())) || null,
            isin: headers.find((h) => /^isin/i.test(h.trim())) || null,
            ...detectHintColumns(headers),
        };

        if (!fallbackMapping.name) {
            throw createError({
                statusCode: 400,
                statusMessage:
                    'Could not identify entity names in CSV. Add NUXT_GEMINI_API_KEY to enable AI-powered column detection.',
            });
        }

        entities = extractEntitiesFromRows(headers, rows, fallbackMapping);
        const detected = Object.entries(fallbackMapping)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}="${v}"`)
            .join(', ');
        explanation = `Detected columns: ${detected}`;
    }

    const explicitEntityType =
        body.desiredEntityType && body.desiredEntityType !== 'auto' ? body.desiredEntityType : null;
    if (explicitEntityType) {
        entities = entities.map((entity) => ({
            ...entity,
            entityTypeHint: entity.entityTypeHint || explicitEntityType,
        }));
        explanation = `${explanation} Default resolution hint: prefer ${explicitEntityType} when no row-level hint is present.`;
    }

    if (entities.some((entity) => entity.entityTypeHint || entity.secondaryEntityTypeHint)) {
        explanation = `${explanation} CSV entity hint columns detected and will be applied per row.`;
    }

    const preview: any = {
        headers,
        explanation,
        entityCount: entities.length,
        sampleRows: rows.slice(0, 5),
        entities,
    };

    if (body.resolve && entities.length > 0) {
        const resolutionResults = await resolveBatchAgentFirst(entities);
        preview.resolutionResults = resolutionResults.map((result, index) => ({
            ...result,
            entityTypeHint: entities[index]?.entityTypeHint,
            secondaryEntityTypeHint: entities[index]?.secondaryEntityTypeHint,
        }));
        preview.resolvedCount = preview.resolutionResults.filter((r: any) => r.matched).length;
        preview.allEntities = entities;
    }

    return preview;
});
