"""SQL query execution for LLM-generated queries."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine


@dataclass
class SqlQueryInfo:
    """Metadata about a SQL query executed for context."""
    label: str
    query: str
    row_count: int
    columns: list[str] = field(default_factory=list)
    rows: list[list[Any]] = field(default_factory=list)
    error: str | None = None


MAX_QUERY_ROWS = 200


def get_table_schema(engine: Engine) -> str:
    """Return the CREATE TABLE statement for TelemetryReadings."""
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='TelemetryReadings'")
        ).fetchone()
        if result:
            return result[0]
    return ""


def execute_queries(engine: Engine, queries: list[dict[str, str]]) -> list[SqlQueryInfo]:
    """Execute a list of SQL queries and return results.

    Each query dict has 'label' and 'sql' keys.
    Only SELECT statements are allowed.
    """
    results: list[SqlQueryInfo] = []

    with engine.connect() as conn:
        for q in queries:
            label = q.get("label", "Query")
            sql = q.get("sql", "").strip()

            if not sql.upper().startswith("SELECT"):
                results.append(SqlQueryInfo(
                    label=label, query=sql, row_count=0,
                    error="Only SELECT queries are allowed.",
                ))
                continue

            try:
                result = conn.execute(text(sql))
                columns = list(result.keys())
                rows = [[str(c) for c in row] for row in result.fetchmany(MAX_QUERY_ROWS)]
                results.append(SqlQueryInfo(
                    label=label, query=sql, row_count=len(rows),
                    columns=columns, rows=rows,
                ))
            except Exception as e:
                results.append(SqlQueryInfo(
                    label=label, query=sql, row_count=0,
                    error=str(e),
                ))

    return results


def format_query_results(query_results: list[SqlQueryInfo]) -> str:
    """Format query results as text for the LLM prompt."""
    if not query_results:
        return "No query results available."

    lines: list[str] = []
    lines.append("--- QUERY RESULTS ---")

    for qr in query_results:
        lines.append(f"\n### {qr.label}")
        lines.append(f"SQL: {qr.query}")

        if qr.error:
            lines.append(f"ERROR: {qr.error}")
            continue

        lines.append(f"({qr.row_count} rows)")

        if qr.columns and qr.rows:
            lines.append("| " + " | ".join(qr.columns) + " |")
            lines.append("|" + "|".join("---" for _ in qr.columns) + "|")
            for row in qr.rows:
                lines.append("| " + " | ".join(row) + " |")

    lines.append("\n--- END QUERY RESULTS ---")
    return "\n".join(lines)
