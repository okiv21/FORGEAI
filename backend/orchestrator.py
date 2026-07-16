"""
Sequential orchestrator.

Runs the agents one after another, passing each agent's structured output forward
via a shared `ctx["outputs"]` dict. Sequential (not parallel) execution is a
deliberate design choice for the 16GB / no-GPU constraint: only one local model
is loaded at a time, so Ollama can unload the previous one before the next runs.

Emits a stream of typed events so the frontend can render the pipeline live.
LangGraph can later replace this module without changing the agent definitions.
"""
from __future__ import annotations

from typing import AsyncIterator

from agents import AGENTS, Agent, agent_public
from model_router import ModelRouter


def _build_message(agent: Agent, ctx: dict):
    """Build the agent's user message — plain text, or a multimodal content list
    with the uploaded reference images attached (for image-accepting agents)."""
    text = agent.build_user(ctx)
    images = ctx.get("images") or []
    if not (agent.accepts_images and images):
        return text
    slots = ", ".join(f"__USER_IMAGE_{i}__" for i in range(len(images)))
    note = (
        f"\n\nThe user attached {len(images)} reference image(s) of their product "
        "or a concept they want. Use them to guide the visual direction, colors, "
        "and product representation — match what they show.\n"
        "IMPORTANT: to make the ACTUAL uploaded image(s) appear in your HTML/React "
        f"output, use these EXACT strings as the image `src`: {slots}. They are "
        "swapped for the real uploaded images before rendering.\n"
        "Look at each image and judge what it IS before placing it: a plain shot of "
        "the product itself belongs in product cards/detail imagery; a photo of a "
        "person/model using or holding the product is LIFESTYLE imagery — use it for "
        "the hero, banners or brand sections, NOT as a catalog product image. If the "
        "user's prompt says how to use an image, follow that exactly. Do NOT invent "
        "external image URLs for the user's own product when a placeholder fits."
    )
    content = [{"type": "text", "text": text + note}]
    for img in images:
        content.append({"type": "image_url", "image_url": {"url": img}})
    return content


async def run_pipeline(
    idea: str, router: ModelRouter, images: list[str] | None = None
) -> AsyncIterator[dict]:
    images = images or []
    ctx: dict = {"idea": idea, "outputs": {}, "images": images}

    yield {"type": "run_start", "agents": [agent_public(a) for a in AGENTS]}

    for agent in AGENTS:
        target = router.resolve(agent.route)
        yield {
            "type": "agent_start",
            "id": agent.id,
            "name": agent.name,
            "model": target.label,
            "fell_back": target.fell_back,
        }

        user = _build_message(agent, ctx)
        buffer: list[str] = []
        candidates = router.chain(agent.route)
        try:
            async for kind, payload in router.stream_chain(
                candidates, agent.system, user
            ):
                if kind == "switch":
                    # Previous model was rate-limited/unavailable. We may have moved
                    # to another cloud model, or degraded all the way to local.
                    buffer.clear()
                    yield {
                        "type": "agent_switch",
                        "id": agent.id,
                        "model": payload.label,  # type: ignore[union-attr]
                        "fell_back": payload.provider == "ollama",  # type: ignore[union-attr]
                    }
                else:
                    buffer.append(payload)  # type: ignore[arg-type]
                    yield {"type": "token", "id": agent.id, "text": payload}
        except Exception as exc:  # surface model/connection errors to the UI
            msg = f"{type(exc).__name__}: {exc}"
            yield {"type": "agent_error", "id": agent.id, "error": msg}
            ctx["outputs"][agent.id] = f"[Agent failed: {msg}]"
            continue

        text = "".join(buffer).strip()
        ctx["outputs"][agent.id] = text
        yield {"type": "agent_done", "id": agent.id, "text": text}

    yield {"type": "run_done", "outputs": ctx["outputs"]}
