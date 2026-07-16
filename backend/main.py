"""
FastAPI entrypoint for the FORGEAI backend.

Endpoints:
  GET  /health          -> Ollama reachability, local models, cloud key status
  GET  /agents          -> the configured pipeline
  POST /run             -> Server-Sent Events stream of the agent pipeline

Run:  uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import json
import os

from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from agents import AGENTS, agent_public
from clarify import fold_answers_into_idea, generate_questions
from export_bundle import build_zip
from model_router import ModelRouter
from orchestrator import run_pipeline
from persistence import ProductionStore

app = FastAPI(title="FORGEAI")
router = ModelRouter()
store = ProductionStore()

DEFAULT_LOCAL_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")
allowed_origins = tuple(
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGIN", ",".join(DEFAULT_LOCAL_ORIGINS)).split(",")
    if origin.strip()
) or DEFAULT_LOCAL_ORIGINS

# Vercel serves each deploy from a fresh hashed *.vercel.app hostname, so an exact
# allowlist breaks whenever the URL changes or a visitor lands on a preview URL.
# Allow any vercel.app subdomain via regex; override with ALLOWED_ORIGIN_REGEX.
allowed_origin_regex = os.getenv(
    "ALLOWED_ORIGIN_REGEX", r"https://[a-zA-Z0-9-]+\.vercel\.app"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_origin_regex=allowed_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    idea: str
    # Optional product/concept reference images as data URLs (base64). Only the
    # vision-capable design agents (UI/UX, Frontend) receive them.
    images: list[str] = Field(default_factory=list, max_length=6)
    # Clarifying answers gathered before the run: [{question, answer}, ...].
    answers: list[dict] = Field(default_factory=list, max_length=8)


class ClarifyRequest(BaseModel):
    idea: str


class ExportRequest(BaseModel):
    idea: str = ""
    # Completed run outputs: agent id -> generated Markdown/code.
    outputs: dict[str, str] = Field(default_factory=dict)


def _slug(text: str) -> str:
    s = "".join(c if c.isalnum() else "-" for c in text.lower()).strip("-")
    parts = [p for p in s.split("-") if p][:4]
    return "-".join(parts) or "forgeai-product"


@app.get("/health")
async def health():
    return await router.health()


@app.get("/agents")
async def agents():
    return {"agents": [agent_public(a) for a in AGENTS]}


@app.post("/clarify")
async def clarify(req: ClarifyRequest):
    """Generate 3-4 idea-specific clarifying questions with tappable options."""
    return {"questions": await generate_questions(req.idea, router)}


@app.post("/run")
async def run(req: RunRequest, authorization: str | None = Header(default=None)):
    user_id = store.user_id_from_authorization(authorization)
    store.claim_generation(user_id)
    idea = fold_answers_into_idea(req.idea, req.answers)

    async def event_stream():
        async for event in run_pipeline(idea, router, req.images):
            yield f"data: {json.dumps(event)}\n\n"
            if event["type"] == "run_done":
                try:
                    project_id = store.save_run(user_id, req.idea, event["outputs"])
                    if project_id:
                        yield f"data: {json.dumps({'type': 'run_saved', 'project_id': project_id})}\n\n"
                except Exception:
                    yield f"data: {json.dumps({'type': 'persistence_error'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/export")
async def export(req: ExportRequest):
    """Bundle a completed run into a downloadable zip (code + docs + host guide)."""
    data = build_zip(req.idea, req.outputs)
    filename = f"{_slug(req.idea)}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
