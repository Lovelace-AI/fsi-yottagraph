# Equity Watchlist Import Spec

## Goal

Define a standard import shape for equity watchlists such as the S&P 500 so the
application can build a project that supports many downstream lenses from one
canonical watchlist.

## Canonical Modeling Rule

Each equity row should resolve into a paired watchlist representation:

- issuer `organization`
- traded `financial_instrument`

The import row itself should be issuer-first, because issuer entities provide
the strongest downstream coverage for:

- EDGAR
- company news
- officers / directors
- ownership filings
- broader corporate events

The traded stock should then be resolved from the same row using ticker and
stock-specific flavor hints.

## Recommended Cloud Import CSV Shape

Use one row per equity issuer with these columns:

- `Security`
    - Issuer / company display name
- `Ticker`
    - Public stock ticker
- `CIK`
    - SEC Central Index Key, zero-padded to 10 digits
- `Watchlist Type`
    - Optional metadata column, recommended value: `equity`
- `Primary Entity Hint`
    - Optional metadata column, recommended value: `organization`
- `Secondary Entity Hint`
    - Optional metadata column, recommended value: `financial_instrument`

### Minimal required import columns

For current app behavior, the most important fields are:

- `Security`
- `Ticker`
- `CIK`

The hint columns are included for forward compatibility with a dedicated
watchlist import mode.

## Resolution Policy

For each row:

1. Resolve issuer as `organization`
    - Prefer `CIK`
    - Fall back to issuer/company name
2. Resolve stock as `financial_instrument`
    - Prefer `Ticker`
    - Fall back to `Ticker + stock` or issuer security title
3. Persist both entities in the same project
4. Persist hard identifiers on both sides where available
5. Record a resolution note when a hard-ID canonical lookup points to another
   NEID, indicating possible undermerge

## Why Issuer-First CSV Is Best

An S&P-style source table already gives:

- issuer name
- stock ticker
- CIK

Those fields are sufficient to:

- anchor the organization strongly through `CIK`
- backfill the stock instrument through ticker and `traded_as`

This is more stable than trying to import stock-only rows, because ticker-only
resolution can be ambiguous without an explicit flavor.

## Expected Lens Coverage

### Organization-driven lenses

- EDGAR filings
- news coverage
- executive / governance changes
- ownership / activist filings
- company-level prediction markets

### Financial-instrument-driven lenses

- stock-specific market views
- ticker-specific prediction markets
- exchange / instrument metadata
- security-level references and price-threshold questions

## Current Recommended Artifact

For cloud project import today, generate and use a CSV with:

- `Security`
- `Ticker`
- `CIK`
- `Watchlist Type`
- `Primary Entity Hint`
- `Secondary Entity Hint`

The current app can use the hard IDs immediately, while the additional columns
document intended semantics for future dedicated watchlist ingestion.
