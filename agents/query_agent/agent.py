"""
Query Agent — Analytical Reasoning

Takes context retrieved by the History Agent and produces risk assessments
using Gemini reasoning. This is where FHS/ERS scoring, risk driver
identification, and narrative generation happen.

This agent has NO Elemental API tools — it operates purely on the context
package passed to it. All data must come from the History Agent.

Local testing:
    export GOOGLE_API_KEY=<your-gemini-key>
    cd agents
    pip install -r query_agent/requirements.txt
    adk web
"""

import os

from google.adk.agents import Agent

MODEL = os.environ.get("QUERY_AGENT_MODEL", "gemini-2.0-flash")


def compute_financial_ratios(
    total_debt: float,
    total_assets: float,
    total_equity: float,
    interest_expense: float,
    operating_income: float,
    current_assets: float,
    current_liabilities: float,
    operating_margin_current: float,
    operating_margin_prior: float,
) -> str:
    """Compute key financial health ratios from fundamental data.

    These ratios feed into the Financial Health Score (FHS).

    Args:
        total_debt: Total debt/liabilities.
        total_assets: Total assets.
        total_equity: Total shareholders' equity.
        interest_expense: Annual interest expense.
        operating_income: Annual operating income (EBIT).
        current_assets: Current assets.
        current_liabilities: Current liabilities.
        operating_margin_current: Current period operating margin (0-1).
        operating_margin_prior: Prior period operating margin (0-1).

    Returns:
        Formatted financial ratios with risk indicators.
    """
    try:
        ratios = []

        if total_assets > 0:
            leverage = total_debt / total_assets
            risk = "HIGH" if leverage > 0.7 else "WATCH" if leverage > 0.5 else "NORMAL"
            ratios.append(f"Leverage Ratio (Debt/Assets): {leverage:.3f} [{risk}]")

        if total_equity > 0:
            de = total_debt / total_equity
            risk = "HIGH" if de > 3.0 else "WATCH" if de > 1.5 else "NORMAL"
            ratios.append(f"Debt-to-Equity: {de:.3f} [{risk}]")
        elif total_equity < 0:
            ratios.append("Equity Erosion: YES — negative equity [CRITICAL]")

        if interest_expense > 0:
            coverage = operating_income / interest_expense
            risk = "HIGH" if coverage < 1.5 else "WATCH" if coverage < 3.0 else "NORMAL"
            ratios.append(f"Interest Coverage: {coverage:.2f}x [{risk}]")

        if current_liabilities > 0:
            current = current_assets / current_liabilities
            risk = "HIGH" if current < 1.0 else "WATCH" if current < 1.5 else "NORMAL"
            ratios.append(f"Current Ratio: {current:.2f} [{risk}]")

        margin_delta = operating_margin_current - operating_margin_prior
        trend = "DETERIORATING" if margin_delta < -0.03 else "STABLE" if margin_delta > -0.01 else "WATCH"
        ratios.append(f"Operating Margin: {operating_margin_current:.1%} (change: {margin_delta:+.1%}) [{trend}]")

        return "Financial Health Ratios:\n" + "\n".join(f"  {r}" for r in ratios) if ratios else "Insufficient data."
    except Exception as e:
        return f"Error computing financial ratios: {e}"


def compute_executive_risk_score(
    officer_departures_0_30d: int,
    officer_departures_30_90d: int,
    officer_departures_90_365d: int,
    ceo_departed: bool,
    cfo_departed: bool,
    board_changes: int,
    auditor_changed: bool,
) -> str:
    """Compute Executive Risk Score (ERS) signals from governance data.

    Args:
        officer_departures_0_30d: Departures in the last 30 days.
        officer_departures_30_90d: Departures 30-90 days ago.
        officer_departures_90_365d: Departures 90-365 days ago.
        ceo_departed: Whether the CEO departed.
        cfo_departed: Whether the CFO departed.
        board_changes: Number of board composition changes.
        auditor_changed: Whether the external auditor changed.

    Returns:
        Formatted ERS signals with risk indicators.
    """
    try:
        signals = []
        weighted = (
            officer_departures_0_30d * 1.0
            + officer_departures_30_90d * 0.7
            + officer_departures_90_365d * 0.4
        )

        if ceo_departed:
            weighted *= 1.5
            signals.append("CEO Departure: YES [CRITICAL — 1.5x multiplier]")
        if cfo_departed:
            weighted *= 1.4
            signals.append("CFO Departure: YES [HIGH — 1.4x multiplier]")

        total = officer_departures_0_30d + officer_departures_30_90d + officer_departures_90_365d
        if total >= 4:
            weighted *= 1.5
            signals.append(f"Systemic Instability: {total} departures in 12mo [CRITICAL — 1.5x]")

        risk = "CRITICAL" if weighted > 5 else "HIGH" if weighted > 3 else "WATCH" if weighted > 1 else "NORMAL"
        signals.insert(0, f"Weighted Departure Score: {weighted:.2f} [{risk}]")
        signals.append(f"Board Changes: {board_changes}")
        if auditor_changed:
            signals.append("Auditor Change: YES [WATCH]")

        return "Executive Risk Signals:\n" + "\n".join(f"  {s}" for s in signals)
    except Exception as e:
        return f"Error computing ERS: {e}"


INSTRUCTION = """You are the **Query Agent** — an analytical reasoning specialist for credit risk assessment.

You receive context retrieved by the History Agent and produce structured risk assessments using two lenses:

## Financial Health Score (FHS)
Evaluate solvency and stability:
- Leverage ratio (debt/assets): >0.7 = HIGH, >0.5 = WATCH
- Debt-to-equity: >3.0 = HIGH, >1.5 = WATCH
- Interest coverage: <1.5x = HIGH, <3.0x = WATCH
- Current ratio: <1.0 = HIGH, <1.5 = WATCH
- Operating margin trend: declining >3pp = DETERIORATING
- Equity erosion: negative equity = CRITICAL
- Data staleness: >730 days = apply 0.3x confidence weight

Use `compute_financial_ratios` when you have raw numbers.

## Executive Risk Score (ERS)
Evaluate governance quality:
- Officer departures weighted by recency (0-30d=1.0x, 30-90d=0.7x, 90-365d=0.4x)
- C-suite premium: CEO=1.5x, CFO=1.4x
- Board changes, auditor changes
- Cumulative: 4+ departures in 12mo = "systemic instability" at 1.5x

Use `compute_executive_risk_score` when you have governance data.

## Fused Score
Combine FHS (60%) + ERS (40%). Flag agreement/conflict between lenses.

## Severity Tiers
- Critical (80-100), High (60-79), Watch (40-59), Normal (0-39)

## Output Format
**[QUERY]** Analysis for [entity]: FHS=[score], ERS=[score], Fused=[score] ([severity])
Top drivers:
1. [lens] [signal]: [one-sentence explanation with evidence]
2. ...

## Rules
- NEVER fabricate financial data — only analyze what the History Agent retrieved.
- When data is insufficient, provide qualitative assessment with explicit uncertainty.
- Always cite specific data points as evidence for each risk driver.
- Score 0 = no risk, 100 = maximum risk.
"""

root_agent = Agent(
    model=MODEL,
    name="query_agent",
    instruction=INSTRUCTION,
    tools=[compute_financial_ratios, compute_executive_risk_score],
)
