"""Supabase-backed production safeguards for generation runs."""
from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException, status
import httpx


DAILY_CAP = 25


class ProductionStore:
    """Verify callers and write with the server-only service key.

    A local installation without Supabase credentials remains usable in offline
    Ollama mode. When both credentials are configured, every run requires a
    valid Supabase access token.
    """

    def __init__(self) -> None:
        url = os.getenv("SUPABASE_URL")
        service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        self.url = url.rstrip("/") if url else None
        self.service_key = service_key

    def user_id_from_authorization(self, authorization: str | None) -> str | None:
        if not self.url or not self.service_key:
            return None
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to run a generation.")
        token = authorization.removeprefix("Bearer ").strip()
        try:
            response = httpx.get(
                f"{self.url}/auth/v1/user",
                headers={"apikey": self.service_key, "Authorization": f"Bearer {token}"},
                timeout=10,
            )
            response.raise_for_status()
            user = response.json()
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session.") from exc
        if not token or not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session.")
        return str(user["id"])

    def claim_generation(self, user_id: str | None) -> None:
        if not self.url or not self.service_key or not user_id:
            return
        try:
            response = httpx.post(
                f"{self.url}/rest/v1/rpc/claim_generation",
                headers={"apikey": self.service_key, "Authorization": f"Bearer {self.service_key}"},
                json={"target_user": user_id, "daily_limit": DAILY_CAP},
                timeout=10,
            )
            response.raise_for_status()
            count = int(response.json() or 0)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Could not verify today's generation limit.") from exc
        if count == 0:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=f"Daily limit reached ({DAILY_CAP} generations). Try again tomorrow.")

    def save_run(self, user_id: str | None, idea: str, outputs: dict[str, Any]) -> str | None:
        if not self.url or not self.service_key or not user_id:
            return None
        response = httpx.post(
            f"{self.url}/rest/v1/projects",
            headers={
                "apikey": self.service_key,
                "Authorization": f"Bearer {self.service_key}",
                "Prefer": "return=representation",
            },
            json={
                "user_id": user_id,
                "idea": idea,
                "prd": outputs.get("pm"),
                "db_schema": outputs.get("database"),
                "code_refs": outputs,
            },
            timeout=20,
        )
        response.raise_for_status()
        rows = response.json() or []
        return str(rows[0]["id"]) if rows else None
