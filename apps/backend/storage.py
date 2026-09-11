"""Case storage: Supabase (via its REST API) when configured, otherwise in memory.

In-memory mode is for local development only — data is lost on restart.
Create the Supabase table with supabase/schema.sql.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import httpx


class MemoryStore:
    name = "memory"

    def __init__(self) -> None:
        self._rows: dict[str, dict] = {}

    def create(self, row: dict) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        row = {**row, "id": str(uuid.uuid4()), "created_at": now, "updated_at": now}
        self._rows[row["id"]] = row
        return row

    def list(self, triage_level: Optional[str], status: Optional[str], limit: int) -> list[dict]:
        rows = sorted(self._rows.values(), key=lambda r: r["created_at"], reverse=True)
        rows = [r for r in rows if (not triage_level or r["triage_level"] == triage_level)
                and (not status or r["status"] == status)]
        return rows[:limit]

    def get(self, case_id: str) -> Optional[dict]:
        return self._rows.get(case_id)

    def update(self, case_id: str, fields: dict) -> Optional[dict]:
        row = self._rows.get(case_id)
        if row is None:
            return None
        row.update(fields, updated_at=datetime.now(timezone.utc).isoformat())
        return row


class SupabaseStore:
    name = "supabase"

    def __init__(self, url: str, key: str) -> None:
        self._base = url.rstrip("/") + "/rest/v1/cases"
        self._client = httpx.Client(
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=representation"},
            timeout=15,
        )

    def create(self, row: dict) -> dict:
        r = self._client.post(self._base, json=row)
        r.raise_for_status()
        return r.json()[0]

    def list(self, triage_level: Optional[str], status: Optional[str], limit: int) -> list[dict]:
        params = {"select": "*", "order": "created_at.desc", "limit": str(limit)}
        if triage_level:
            params["triage_level"] = f"eq.{triage_level}"
        if status:
            params["status"] = f"eq.{status}"
        r = self._client.get(self._base, params=params)
        r.raise_for_status()
        return r.json()

    def get(self, case_id: str) -> Optional[dict]:
        r = self._client.get(self._base, params={"select": "*", "id": f"eq.{case_id}"})
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def update(self, case_id: str, fields: dict) -> Optional[dict]:
        fields = {**fields, "updated_at": datetime.now(timezone.utc).isoformat()}
        r = self._client.patch(self._base, params={"id": f"eq.{case_id}"}, json=fields)
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None


def get_store():
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY")
    return SupabaseStore(url, key) if url and key else MemoryStore()
