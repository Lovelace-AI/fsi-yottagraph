import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

let _sql: NeonQueryFunction | null = null;

export function isDbConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

export function getDb(): NeonQueryFunction | null {
    if (_sql) return _sql;
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    _sql = neon(url);
    return _sql;
}
