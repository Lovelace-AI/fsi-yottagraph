# Elemental Watchlist Learnings

## Purpose

This document captures live learnings from the Elemental MCP while building
watchlist ingestion for equity universes like the S&P 500.

The guiding model is:

- one watchlist
- one underlying truth set
- many downstream lenses

For a stock watchlist, the project should usually contain both:

- the issuing `organization`
- the traded `financial_instrument`

## Core Flavors Needed For An S&P Watchlist

### Primary project members

- `organization`
    - Needed for company-level identity, news, EDGAR, ownership, officers, and
      broader event context.
- `financial_instrument`
    - Needed for stock-centric views, ticker identity, exchange data, and
      market-specific prediction questions.

### Downstream related flavors to query, not necessarily store as primary members

- `article`
    - News coverage is reached through `appears_in`.
- `prediction_market`
    - Polymarket-style tradeable questions are reached through `appears_in`.
- `prediction_event`
    - Parent event layer above prediction markets.
- `document`
    - Generic document layer.
- `sec::10_k`, `sec::10_q`, `sec::8_k`, `sec::def_14a`, `sec::form_3`,
  `sec::form_4`, `sec::sc_13d`, `sec::sc_13g`, `sec::13f_hr`
    - EDGAR and ownership filing flavors.
- `person`
    - Executives, directors, officers, major holders.
- `location`
    - Headquarters, incorporation, operating footprint.
- `event`
    - Extracted events affecting the issuer or instrument.

## Key Properties To Prefer As Hard IDs

### Organization

- `company_cik`
- `ticker`
- `lei`
- `ein`
- `cusip_number` (sometimes present)
- `exchange`
- `security_12b_title`

### Financial instrument

- `ticker_symbol`
- `cusip_number`
- `company_name`
- `security_type`
- `exchange`

## Key Relationships For Equity Watchlists

### Organization -> Financial instrument

- `traded_as`
    - Best relationship for mapping a public company to its traded common stock.
- `issued_security`
    - Useful, but often returns broader security coverage such as bonds.
- `issuer_of`
    - Also useful for debt and other issued instruments.
- `issues`
    - Another issuer-side path that can point to instruments.

### Entity -> source / downstream lenses

- `appears_in`
    - Connects `organization` or `financial_instrument` to `article`,
      `document`, `prediction_event`, and `prediction_market`.
- `filing_reference`
    - Connects entity records to filings that mention or source the entity.
- `filed`
    - Connects issuer/filer entities to filing documents.
- `issued_by`
    - Connects filing documents back to the issuer organization.
- `refers_to`
    - Connects filings to the company or person they are about.

## Live MCP Examples

### Apple by CIK resolves to organization

- `company_cik = 0000320193`
- resolves to `Apple Inc`
- flavor: `organization`

### AAPL by ticker can be ambiguous

- searching `AAPL` without a flavor can prefer `organization`
- searching `AAPL` with `flavor = financial_instrument` resolves to
  `Apple Inc. stock`

This means watchlist ingestion should not rely on ticker-only auto-resolution
without a flavor hint.

### Apple organization to stock

- `Apple Inc` exposes `traded_as` to a `financial_instrument`
- `Apple Inc` also exposes `issued_security` for many bond CUSIPs

This means `traded_as` is the cleanest relationship for common-stock pairing,
while `issued_security` is broader and should not be treated as "the stock"
without filtering.

### Apple organization to EDGAR

- `Apple Inc` relates to `sec::10_k` documents through
  `filing_reference`, `filed`, `issued_by`, and `refers_to`

This validates that the `organization` entity is the correct anchor for EDGAR
views.

### Prediction markets can attach to both organization and stock

- `Apple Inc` has `appears_in` links to prediction markets
- `Apple Inc. stock` also has `appears_in` links to price-threshold markets

This means both flavors matter:

- `organization` captures company / product / ecosystem questions
- `financial_instrument` captures ticker / price / market questions

## Recommended Ingestion Model For Stock Watchlists

For each S&P row, ingest a paired set:

1. Resolve the issuer as `organization`
    - Prefer `company_cik`
    - Fall back to `Security` / issuer name
2. Resolve the traded stock as `financial_instrument`
    - Prefer `ticker`
    - Use issuer name plus explicit flavor hint when needed
3. Persist both entities in the project
4. Persist hard IDs on both sides where available
5. Flag possible undermerge when a hard-ID canonical lookup points to a
   different NEID than a name/ticker resolution

## MCP Tool Learnings

### What works well

- `elemental_get_schema` without `query`
- `elemental_get_entity` with explicit `flavor`
- `elemental_get_entity` with structured IDs like `company_cik`
- `elemental_get_related` with explicit `relationship_types`

### Important caveat

- `elemental_get_schema` with the `query` parameter failed in this environment
  due a Vertex permission error on the schema resolver model

Recommendation:

- use plain schema fetches plus direct entity/relationship probes instead of
  relying on query-assisted schema narrowing

## Product Implication

For an equity watchlist, the project should be modeled as:

- primary stored entities:
    - `organization`
    - `financial_instrument`
- queried downstream from those entities:
    - filings
    - articles
    - prediction markets
    - events
    - officers / directors / holders

That gives the app one canonical watchlist with many lens-specific traversals.
