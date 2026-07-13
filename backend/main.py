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
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agents import AGENTS, agent_public
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    idea: str
    # Optional product/concept reference images as data URLs (base64). Only the
    # vision-capable design agents (UI/UX, Frontend) receive them.
    images: list[str] = Field(default_factory=list, max_length=6)


@app.get("/health")
async def health():
    return await router.health()


@app.get("/agents")
async def agents():
    return {"agents": [agent_public(a) for a in AGENTS]}


@app.post("/run")
async def run(req: RunRequest, authorization: str | None = Header(default=None)):
    user_id = store.user_id_from_authorization(authorization)
    store.claim_generation(user_id)

    async def event_stream():
        async for event in run_pipeline(req.idea, router, req.images):
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
