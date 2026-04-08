import { resolveBatch } from '~/server/utils/resolutionPipeline';

interface CsvColumn {
    header: string;
    mapping:
        | 'name'
        | 'cik'
        | 'ticker'
        | 'cusip'
        | 'figi'
        | 'isin'
        | 'lei'
        | 'ein'
        | 'address'
        | 'ignore';
}

const AUTO_MAP: Record<string, CsvColumn['mapping']> = {
    name: 'name',
    company: 'name',
    entity: 'name',
    company_name: 'name',
    entity_name: 'name',
    issuer: 'name',
    cik: 'cik',
    ticker: 'ticker',
    symbol: 'ticker',
    cusip: 'cusip',
    figi: 'figi',
    isin: 'isin',
    lei: 'lei',
    ein: 'ein',
    address: 'address',
};

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

function autoDetectMappings(headers: string[]): CsvColumn[] {
    return headers.map((h) => {
        const normalized = h.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const mapping = AUTO_MAP[normalized] || 'ignore';
        return { header: h, mapping };
    });
}

export default defineEventHandler(async (event) => {
    const body = await readBody<{
        csvText: string;
        columnMappings?: CsvColumn[];
        resolve?: boolean;
    }>(event);

    if (!body?.csvText?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'csvText is required' });
    }

    const { headers, rows } = parseCsv(body.csvText);
    if (headers.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'No valid CSV headers found' });
    }

    const mappings = body.columnMappings || autoDetectMappings(headers);
    const nameIdx = mappings.findIndex((m) => m.mapping === 'name');
    const tickerIdx = mappings.findIndex((m) => m.mapping === 'ticker');
    const cikIdx = mappings.findIndex((m) => m.mapping === 'cik');

    if (nameIdx === -1) {
        throw createError({
            statusCode: 400,
            statusMessage:
                'No column mapped to "name". At least one column must be mapped as entity name.',
        });
    }

    const entities = rows
        .map((row) => ({
            name: row[nameIdx] || '',
            ticker: tickerIdx >= 0 ? row[tickerIdx] || undefined : undefined,
            cik: cikIdx >= 0 ? row[cikIdx] || undefined : undefined,
        }))
        .filter((e) => e.name);

    const preview: any = {
        headers,
        mappings,
        entityCount: entities.length,
        sampleRows: rows.slice(0, 5),
    };

    if (body.resolve && entities.length > 0) {
        const batchSize = Math.min(entities.length, 50);
        preview.resolutionResults = await resolveBatch(entities.slice(0, batchSize));
        preview.resolvedCount = preview.resolutionResults.filter((r: any) => r.matched).length;
    }

    return preview;
});
