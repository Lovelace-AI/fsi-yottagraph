"""
Scoring helper tools for the Credit Monitor agent.

These tools perform deterministic financial ratio calculations that the
Query sub-agent uses as inputs for its Gemini-backed risk assessment.
"""


def compute_financial_ratios(
    total_debt: float,
    total_assets: float,
    total_equity: float,
    interest_expense: float,
    operating_income: float,
    current_assets: float,
    current_liabilities: float,
    revenue: float,
    operating_margin_current: float,
    operating_margin_prior: float,
) -> str:
    """Compute key financial health ratios from fundamental data.

    These ratios feed into the Financial Health Score (FHS). The Query Agent
    uses them alongside Gemini reasoning to produce a risk assessment.

    Args:
        total_debt: Total debt/liabilities.
        total_assets: Total assets.
        total_equity: Total shareholders' equity.
        interest_expense: Annual interest expense.
        operating_income: Annual operating income (EBIT).
        current_assets: Current assets.
        current_liabilities: Current liabilities.
        revenue: Annual revenue.
        operating_margin_current: Current period operating margin (0-1).
        operating_margin_prior: Prior period operating margin (0-1).

    Returns:
        Formatted financial ratios with interpretation.
    """
    try:
        ratios = []

        leverage = total_debt / total_assets if total_assets > 0 else None
        if leverage is not None:
            risk = "HIGH" if leverage > 0.7 else "WATCH" if leverage > 0.5 else "NORMAL"
            ratios.append(f"Leverage Ratio (Debt/Assets): {leverage:.3f} [{risk}]")

        de_ratio = total_debt / total_equity if total_equity > 0 else None
        if de_ratio is not None:
            risk = "HIGH" if de_ratio > 3.0 else "WATCH" if de_ratio > 1.5 else "NORMAL"
            ratios.append(f"Debt-to-Equity: {de_ratio:.3f} [{risk}]")

        if interest_expense > 0 and operating_income is not None:
            coverage = operating_income / interest_expense
            risk = "HIGH" if coverage < 1.5 else "WATCH" if coverage < 3.0 else "NORMAL"
            ratios.append(f"Interest Coverage: {coverage:.2f}x [{risk}]")

        if current_liabilities > 0:
            current = current_assets / current_liabilities
            risk = "HIGH" if current < 1.0 else "WATCH" if current < 1.5 else "NORMAL"
            ratios.append(f"Current Ratio: {current:.2f} [{risk}]")

        margin_delta = operating_margin_current - operating_margin_prior
        trend = "DETERIORATING" if margin_delta < -0.03 else "STABLE" if margin_delta > -0.01 else "WATCH"
        ratios.append(
            f"Operating Margin: {operating_margin_current:.1%} (change: {margin_delta:+.1%}) [{trend}]"
        )

        equity_eroding = total_equity < 0
        if equity_eroding:
            ratios.append("Equity Erosion: YES — negative equity [CRITICAL]")

        if not ratios:
            return "Insufficient data to compute financial ratios."

        return "Financial Health Ratios:\n" + "\n".join(f"  {r}" for r in ratios)
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

    Weights officer departures by recency and role seniority, detects
    cumulative departure patterns, and flags auditor changes.

    Args:
        officer_departures_0_30d: Officer departures in the last 30 days.
        officer_departures_30_90d: Officer departures 30-90 days ago.
        officer_departures_90_365d: Officer departures 90-365 days ago.
        ceo_departed: Whether the CEO departed in the analysis window.
        cfo_departed: Whether the CFO departed in the analysis window.
        board_changes: Number of board composition changes.
        auditor_changed: Whether the external auditor changed.

    Returns:
        Formatted ERS signals with risk indicators.
    """
    try:
        signals = []
        weighted_departures = (
            officer_departures_0_30d * 1.0
            + officer_departures_30_90d * 0.7
            + officer_departures_90_365d * 0.4
        )

        if ceo_departed:
            weighted_departures *= 1.5
            signals.append("CEO Departure: YES [CRITICAL — 1.5x multiplier applied]")
        if cfo_departed:
            weighted_departures *= 1.4
            signals.append("CFO Departure: YES [HIGH — 1.4x multiplier applied]")

        total_departures = (
            officer_departures_0_30d
            + officer_departures_30_90d
            + officer_departures_90_365d
        )
        if total_departures >= 4:
            weighted_departures *= 1.5
            signals.append(
                f"Systemic Instability: {total_departures} departures in 12 months "
                f"[CRITICAL — 1.5x multiplier]"
            )

        risk = "CRITICAL" if weighted_departures > 5 else "HIGH" if weighted_departures > 3 else "WATCH" if weighted_departures > 1 else "NORMAL"
        signals.insert(
            0,
            f"Weighted Departure Score: {weighted_departures:.2f} [{risk}]"
        )
        signals.append(
            f"Departures: {officer_departures_0_30d} (0-30d), "
            f"{officer_departures_30_90d} (30-90d), "
            f"{officer_departures_90_365d} (90-365d)"
        )
        signals.append(f"Board Changes: {board_changes}")
        if auditor_changed:
            signals.append("Auditor Change: YES [WATCH]")

        return "Executive Risk Signals:\n" + "\n".join(f"  {s}" for s in signals)
    except Exception as e:
        return f"Error computing executive risk score: {e}"
