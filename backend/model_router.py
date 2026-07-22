"""
Model router: implements the hybrid local/cloud strategy from the project guide.

- Lightweight, high-frequency agents  -> local Ollama models (free, CPU-only).
- Heavy / reasoning agents (PM, Code Reviewer) -> cloud APIs when a key is set,
  otherwise they fall back gracefully to a local model.

Because the orchestrator calls agents SEQUENTIALLY, only one local model is
resident at a time; Ollama unloads idle models automatically. That is what keeps
the whole pipeline inside 16GB of RAM with no GPU.
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from typing import AsyncIterator

import httpx
from dotenv import load_dotenv

load_dotenv()

# Cloud failures worth retrying: rate limits, overload, and transport hiccups.
# Free-tier models return 429 routinely, so this is the common path.
_TRANSIENT_STATUS = {408, 409, 425, 429, 500, 502, 503, 504, 529}

# Streaming timeout: generous connect + a per-read (between-token) cap so a stalled
# model fails over instead of hanging forever. A long-but-progressing generation is
# fine because the read clock resets on every chunk.
_STREAM_TIMEOUT = httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0)

# Cap output tokens: without this, OpenRouter defaults to the model's full context
# (e.g. 65536), which makes paid models demand huge credit reservations up front
# (a 402 on a low balance) and lets slow models run away. Override with env.
_MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS") or "16000")


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _TRANSIENT_STATUS
    return isinstance(exc, (httpx.TimeoutException, httpx.TransportError))


def _is_rate_limited(exc: Exception) -> bool:
    """429 usually means the free model is out of shared capacity, and a few
    seconds of backoff won't clear it. When another candidate model is available
    we fail over to it immediately; we only back off when it's our last option."""
    return (
        isinstance(exc, httpx.HTTPStatusError)
        and exc.response.status_code == 429
    )


def _env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def _flatten_content(content) -> str:
    """Reduce a multimodal content list to text, noting any dropped images."""
    if isinstance(content, str):
        return content
    texts, images = [], 0
    for part in content:
        if part.get("type") == "text":
            texts.append(part.get("text", ""))
        elif part.get("type") == "image_url":
            images += 1
    out = "\n".join(t for t in texts if t)
    if images:
        out += f"\n\n[{images} reference image(s) attached — not visible to this model.]"
    return out


def _is_vision(model: str) -> bool:
    """Heuristic: does this model accept image input? Used to decide whether to
    forward uploaded images or strip them to text for a non-vision fallback."""
    m = model.lower()
    return any(
        t in m
        for t in (
            "gpt-5", "gpt-4o", "gemini", "claude", "-vl", "vision",
            # Kimi K2.6 / K2.7 / K3 accept image input (design agents run on these).
            "kimi-k2.5", "kimi-k2.6", "kimi-k2.7", "kimi-k3",
        )
    )


@dataclass
class Resolved:
    """A concrete, callable model target after fallback logic runs."""
    provider: str          # "ollama" | "openai-compatible"
    label: str             # human-readable, shown in the UI
    model: str
    base_url: str
    api_key: str | None
    fell_back: bool = False  # True if a cloud agent was downgraded to local
    vision: bool = False     # True if the model can accept image input


class ModelRouter:
    def __init__(self) -> None:
        self.ollama_base = _env("OLLAMA_BASE_URL", "http://localhost:11434")
        self.local_small = _env("LOCAL_MODEL_SMALL", "llama3.2:3b")
        self.local_medium = _env("LOCAL_MODEL_MEDIUM", "qwen3:8b")
        self.local_frontend = _env("LOCAL_MODEL_FRONTEND") or self.local_medium

        self.moonshot_key = _env("MOONSHOT_API_KEY")
        self.deepseek_key = _env("DEEPSEEK_API_KEY")
        self.openrouter_key = _env("OPENROUTER_API_KEY")

    # -- resolution -------------------------------------------------------
    def _local(self, model: str) -> Resolved:
        return Resolved("ollama", f"Ollama · {model}", model, self.ollama_base, None)

    # Env vars holding the OpenRouter model list for each cloud route.
    _OR_ENV = {
        "cloud-pm": "OPENROUTER_PM_MODEL",
        "cloud-backend": "OPENROUTER_BACKEND_MODEL",
        "cloud-frontend": "OPENROUTER_FRONTEND_MODEL",
        "cloud-reviewer": "OPENROUTER_REVIEWER_MODEL",
    }

    def _or_slugs(self, route: str) -> list[str]:
        """A route's OpenRouter models, in preference order (comma-separated env).

        The design agents (UI/UX + Frontend, both on 'cloud-frontend') lead with a
        single swappable DESIGN_AGENT_MODEL, so the whole design tier can be pointed
        at a different model (moonshotai/kimi-k2.6, moonshotai/kimi-k3, or
        openai/gpt-5.6-sol) in ONE place for the model bake-off. The route's
        OPENROUTER_FRONTEND_MODEL entries stay on as fallbacks so a run still
        completes if the primary is rate-limited.
        """
        slugs: list[str] = []
        if route == "cloud-frontend":
            design = _env("DESIGN_AGENT_MODEL", "moonshotai/kimi-k2.6")
            slugs += [s.strip() for s in design.split(",") if s.strip()]
        raw = _env(self._OR_ENV.get(route, ""))
        slugs += [s.strip() for s in raw.split(",") if s.strip()]
        # De-duplicate while preserving order.
        seen: set[str] = set()
        ordered: list[str] = []
        for s in slugs:
            if s not in seen:
                seen.add(s)
                ordered.append(s)
        return ordered

    def _or_target(self, slug: str) -> Resolved:
        return Resolved(
            "openai-compatible",
            f"OpenRouter · {slug.split('/')[-1]}",
            slug,
            _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            self.openrouter_key,
            vision=_is_vision(slug),
        )

    def _deepseek_target(self, model: str) -> Resolved:
        return Resolved(
            "openai-compatible",
            f"DeepSeek · {model}",
            model,
            _env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
            self.deepseek_key,
        )

    def _cloud_targets(self, route: str) -> list[Resolved]:
        """Ordered cloud models to try for a route, before any local fallback.

        DeepSeek (if funded) leads the UI/UX + Frontend (cloud-frontend) and the
        Code Reviewer (cloud-reviewer) routes. A dead/unfunded DeepSeek returns a
        non-transient 402, so stream_chain skips straight to the next candidate.
        """
        targets: list[Resolved] = []
        if route == "cloud-pm" and self.moonshot_key:
            targets.append(
                Resolved("openai-compatible", "Moonshot · Kimi K2",
                         _env("MOONSHOT_MODEL", "kimi-k2-0711-preview"),
                         _env("MOONSHOT_BASE_URL", "https://api.moonshot.ai/v1"),
                         self.moonshot_key)
            )
        if route == "cloud-frontend" and self.deepseek_key:
            targets.append(self._deepseek_target(_env("DEEPSEEK_FRONTEND_MODEL", "deepseek-chat")))
        if route == "cloud-reviewer" and self.deepseek_key:
            targets.append(self._deepseek_target(_env("DEEPSEEK_MODEL", "deepseek-reasoner")))
        if self.openrouter_key:
            targets.extend(self._or_target(slug) for slug in self._or_slugs(route))
        return targets

    def resolve(self, route: str) -> Resolved:
        """The single model an agent nominally runs on (chain's first candidate)."""
        return self.chain(route)[0]

    # -- inference --------------------------------------------------------
    async def stream(
        self, target: Resolved, system: str, user
    ) -> AsyncIterator[str]:
        """Yield text chunks from the resolved model.

        `user` is either a plain string, or a multimodal content list
        (`[{"type": "text", ...}, {"type": "image_url", ...}]`). Images are only
        forwarded to vision-capable OpenAI-compatible models; for everything else
        (text models, Ollama fallbacks) the content is flattened to its text.
        """
        if isinstance(user, list) and not (
            target.provider == "openai-compatible" and target.vision
        ):
            user = _flatten_content(user)

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        if target.provider == "ollama":
            async for chunk in self._stream_ollama(target, messages):
                yield chunk
        else:
            async for chunk in self._stream_openai(target, messages):
                yield chunk

    async def _stream_ollama(self, t: Resolved, messages) -> AsyncIterator[str]:
        import json
        url = f"{t.base_url}/api/chat"
        payload = {"model": t.model, "messages": messages, "stream": True}
        async with httpx.AsyncClient(timeout=_STREAM_TIMEOUT) as client:
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    piece = (data.get("message") or {}).get("content", "")
                    if piece:
                        yield piece

    async def _stream_openai(self, t: Resolved, messages) -> AsyncIterator[str]:
        import json
        url = f"{t.base_url}/chat/completions"
        headers = {"Authorization": f"Bearer {t.api_key}", "Content-Type": "application/json"}
        payload = {
            "model": t.model,
            "messages": messages,
            "stream": True,
            "max_tokens": _MAX_OUTPUT_TOKENS,
        }
        async with httpx.AsyncClient(timeout=_STREAM_TIMEOUT) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:"):].strip()
                    if data == "[DONE]":
                        break
                    obj = json.loads(data)
                    delta = (obj.get("choices") or [{}])[0].get("delta", {})
                    piece = delta.get("content") or ""
                    if piece:
                        yield piece

    def local_equivalent(self, route: str) -> Resolved:
        """The local model a cloud agent should degrade to when the API is unusable."""
        model = self.local_frontend if route == "cloud-frontend" else self.local_medium
        r = self._local(model)
        r.fell_back = True
        return r

    def chain(self, route: str) -> list[Resolved]:
        """
        Ordered list of models to try for a route.

        Cloud models (DeepSeek / Moonshot / OpenRouter) are tried in preference
        order — they fail over independently (rate limits, congestion, 402) — then
        a local Ollama model is appended last, guaranteeing the pipeline completes.
        """
        if route == "local-small":
            return [self._local(self.local_small)]
        if route == "local-frontend":
            return [self._local(self.local_frontend)]
        if route == "local-medium":
            return [self._local(self.local_medium)]

        cloud = self._cloud_targets(route)
        if not cloud:
            # No cloud key configured for this route -> local only.
            return [self.local_equivalent(route)]
        return cloud + [self.local_equivalent(route)]

    async def stream_chain(
        self, candidates: list[Resolved], system: str, user: str
    ) -> AsyncIterator[tuple[str, object]]:
        """
        Stream from the first candidate that works.

        Yields ("token", str) for content and ("switch", Resolved) whenever we move
        to a different model. Transient errors (429 rate limits, 5xx) are retried
        with backoff before advancing to the next candidate. If a model already
        emitted output we do NOT retry or switch, to avoid duplicating text.
        """
        last_exc: Exception | None = None
        for index, target in enumerate(candidates):
            if index > 0:
                yield ("switch", target)

            is_last = index == len(candidates) - 1
            max_retries = 2 if target.provider != "ollama" else 0
            attempt = 0
            while True:
                started = False
                try:
                    async for piece in self.stream(target, system, user):
                        started = True
                        yield ("token", piece)
                    return
                except Exception as exc:
                    last_exc = exc
                    if started:
                        raise  # partial output already sent; don't duplicate

                    # A congested free model won't recover in seconds — if another
                    # candidate is waiting, fail over quickly instead of backing off.
                    if _is_rate_limited(exc) and not is_last:
                        break

                    if attempt < max_retries and _is_transient(exc):
                        await asyncio.sleep(3 * (2**attempt))  # 3s, 6s
                        attempt += 1
                        continue
                    break  # move on to the next candidate

        raise last_exc if last_exc else RuntimeError("no model candidates available")

    async def list_openrouter_free(self) -> list[dict]:
        """Return OpenRouter models that cost $0 (pricing prompt+completion == 0)."""
        if not self.openrouter_key:
            return []
        base = _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
        headers = {"Authorization": f"Bearer {self.openrouter_key}"}
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"{base}/models", headers=headers)
            resp.raise_for_status()
            models = resp.json().get("data", [])
        free = []
        for m in models:
            p = m.get("pricing", {}) or {}
            if str(p.get("prompt", "1")) == "0" and str(p.get("completion", "1")) == "0":
                free.append(
                    {
                        "id": m.get("id", ""),
                        "context": m.get("context_length", 0),
                        "name": m.get("name", ""),
                    }
                )
        free.sort(key=lambda x: -x["context"])
        return free

    async def health(self) -> dict:
        """Report which local models are available and which cloud keys are set."""
        info = {
            "ollama_reachable": False,
            "ollama_models": [],
            "cloud": {
                "moonshot": bool(self.moonshot_key),
                "deepseek": bool(self.deepseek_key),
                "openrouter": bool(self.openrouter_key),
            },
        }
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get(f"{self.ollama_base}/api/tags")
                resp.raise_for_status()
                info["ollama_reachable"] = True
                info["ollama_models"] = [m["name"] for m in resp.json().get("models", [])]
        except Exception:
            pass
        return info
