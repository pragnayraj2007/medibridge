"""Storage: Supabase (PostgREST) when configured, otherwise in memory.

A small table-level interface shared by both backends:
  insert(table, row) -> row
  select(table, filters, order=None, desc=False, limit=None) -> [rows]
  update(table, id, fields) -> row | None
filters: {column: (op, value)} with op in eq, neq, in, gte, lte, is_null.

In-memory mode is for local development and tests only (data is lost on
restart); it seeds the demo doctors and enforces the same unique rules as the
database. Create the Supabase tables with supabase/schema.sql and
supabase/migrations/*.sql.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

log = logging.getLogger("medibridge.storage")

TABLES = ("patients", "doctors", "cases", "appointments", "documents")


class Conflict(Exception):
    """A unique constraint rejected the write (e.g. a slot was just taken)."""


class StorageError(Exception):
    """The database could not be reached or rejected the request."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cmp(a: Any, b: Any) -> tuple[Any, Any]:
    """Compare timestamps as datetimes, everything else as-is."""
    if isinstance(a, str) and isinstance(b, str) and len(a) >= 19 and a[4:5] == "-" and b[4:5] == "-":
        try:
            pa = datetime.fromisoformat(a.replace("Z", "+00:00"))
            pb = datetime.fromisoformat(b.replace("Z", "+00:00"))
            return pa, pb
        except ValueError:
            pass
    return a, b


def _match(row: dict, filters: dict) -> bool:
    for col, (op, val) in filters.items():
        v = row.get(col)
        if op == "eq" and v != val:
            return False
        if op == "neq" and v == val:
            return False
        if op == "in" and v not in val:
            return False
        if op == "is_null" and (v is None) != bool(val):
            return False
        if op in ("gte", "lte"):
            if v is None:
                return False
            a, b = _cmp(v, val)
            if (op == "gte" and a < b) or (op == "lte" and a > b):
                return False
    return True


class MemoryStore:
    name = "memory"

    def __init__(self) -> None:
        from seed import doctor_rows
        self._t: dict[str, dict[str, dict]] = {t: {} for t in TABLES}
        now = datetime.now(timezone.utc)
        for d in doctor_rows(now):
            self._t["doctors"][d["id"]] = {**d, "created_at": now.isoformat(), "updated_at": now.isoformat()}

    def _check_unique(self, table: str, row: dict, ignore_id: str | None = None) -> None:
        others = [r for r in self._t[table].values() if r["id"] != ignore_id]
        if table == "patients" and any(r["patient_code"] == row.get("patient_code") for r in others):
            raise Conflict("patient_code")
        if table == "doctors" and row.get("email") and any(r.get("email") == row["email"] for r in others):
            raise Conflict("email")
        if table == "appointments" and row.get("status") != "cancelled" and any(
            r["doctor_id"] == row.get("doctor_id") and r["status"] != "cancelled"
            and _cmp(r["scheduled_at"], row.get("scheduled_at"))[0] == _cmp(r["scheduled_at"], row.get("scheduled_at"))[1]
            for r in others
        ):
            raise Conflict("appointment slot")

    def insert(self, table: str, row: dict) -> dict:
        now = _now()
        row = {"id": str(uuid.uuid4()), "created_at": now, **row}
        if table != "documents":
            row.setdefault("updated_at", now)
        self._check_unique(table, row)
        self._t[table][row["id"]] = row
        return dict(row)

    def select(self, table: str, filters: Optional[dict] = None, order: str | None = None,
               desc: bool = False, limit: int | None = None, columns: str = "*") -> list[dict]:
        rows = [dict(r) for r in self._t[table].values() if _match(r, filters or {})]
        if order:
            rows.sort(key=lambda r: _cmp(r.get(order) or "", r.get(order) or "")[0], reverse=desc)
        return rows[:limit] if limit else rows

    def update(self, table: str, row_id: str, fields: dict) -> Optional[dict]:
        row = self._t[table].get(row_id)
        if row is None:
            return None
        merged = {**row, **fields}
        if table != "documents":
            merged["updated_at"] = _now()
        self._check_unique(table, merged, ignore_id=row_id)
        self._t[table][row_id] = merged
        return dict(merged)


class SupabaseStore:
    name = "supabase"

    def __init__(self, url: str, key: str) -> None:
        self._base = url.rstrip("/") + "/rest/v1/"
        headers = {"apikey": key, "Prefer": "return=representation"}
        if key.startswith("eyJ"):  # legacy service_role JWT; new sb_secret_ keys go in apikey only
            headers["Authorization"] = f"Bearer {key}"
        # Short keep-alive: serverless instances sleep between requests and a pooled
        # connection the server has already closed fails on reuse.
        self._client = httpx.Client(headers=headers, timeout=15,
                                    limits=httpx.Limits(max_keepalive_connections=5, keepalive_expiry=5))

    @staticmethod
    def _params(filters: Optional[dict]) -> dict:
        params: dict[str, str] = {}
        for col, (op, val) in (filters or {}).items():
            if op == "in":
                params[col] = "in.(" + ",".join(f'"{v}"' for v in val) + ")"
            elif op == "is_null":
                params[col] = "is.null" if val else "not.is.null"
            else:
                params[col] = f"{op}.{val}"
        return params

    def _send(self, method: str, table: str, **kw) -> list[dict]:
        # One retry for transient transport failures. GET and PATCH are idempotent here;
        # POST is retried only when the connection failed before the request was sent.
        retryable = (httpx.ConnectError, httpx.PoolTimeout) if method == "POST" else (httpx.TransportError,)
        for attempt in (1, 2):
            try:
                r = self._client.request(method, self._base + table, **kw)
            except retryable as e:
                if attempt == 1:
                    log.warning("Supabase %s %s failed (%s), retrying", method, table, type(e).__name__)
                    continue
                raise StorageError(f"database unreachable: {type(e).__name__}") from e
            except httpx.HTTPError as e:
                raise StorageError(f"database unreachable: {type(e).__name__}") from e
            if r.status_code in (502, 503, 504) and method != "POST" and attempt == 1:
                log.warning("Supabase %s %s returned %s, retrying", method, table, r.status_code)
                continue
            break
        if r.status_code == 409 or (r.status_code == 400 and '"23505"' in r.text):
            raise Conflict(r.text[:200])
        if r.status_code >= 400:
            raise StorageError(f"database error {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else []

    def insert(self, table: str, row: dict) -> dict:
        return self._send("POST", table, json=row)[0]

    def select(self, table: str, filters: Optional[dict] = None, order: str | None = None,
               desc: bool = False, limit: int | None = None, columns: str = "*") -> list[dict]:
        params = {"select": columns, **self._params(filters)}
        if order:
            params["order"] = f"{order}.{'desc' if desc else 'asc'}"
        if limit:
            params["limit"] = str(limit)
        return self._send("GET", table, params=params)

    def update(self, table: str, row_id: str, fields: dict) -> Optional[dict]:
        if table != "documents":
            fields = {**fields, "updated_at": _now()}
        rows = self._send("PATCH", table, params={"id": f"eq.{row_id}"}, json=fields)
        return rows[0] if rows else None


def get_store():
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    return SupabaseStore(url, key) if url and key else MemoryStore()
