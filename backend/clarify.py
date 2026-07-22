"""
Clarifying-questions step: before the pipeline runs, ask the user 3 to 4
idea-specific questions whose answers most change what gets built. The answers
are folded into the idea the Product Manager receives, so the agents stop
guessing about audience, scope, monetisation, and constraints.
"""
from __future__ import annotations

import json
import re

from model_router import ModelRouter

CLARIFY_SYSTEM = """You are a product discovery interviewer. Read the user's idea
and generate clarifying questions whose answers most change WHAT gets built and
HOW it looks. Skip anything the idea already answers.

Cover these axes, adapted to the specific idea:
- The specific products, items, or core entities the app involves. For a hair
  store that means the actual products (hair oil, shampoo, edge control, bonnet).
  For a booking site, the services offered.
- How those items are packaged or visually presented (amber dropper bottle, pump
  bottle, matte jar, tube). This drives the imagery, so ask it for visual products.
- The primary user or audience (natural or curly hair, men's grooming, and so on).
- The brand feel or aesthetic direction (luxury minimal, playful, clinical,
  earthy natural).
- The key pages, sections, or features needed.
- How it makes money, if that is unclear (free, one time, subscription, marketplace).

Make the DEPTH adaptive:
- Ask MORE questions (up to 8) for visual, catalog, or e-commerce ideas where the
  specific items, packaging, and look matter most.
- Ask FEWER (as few as 3 to 4) for simple utility apps where visual specifics
  matter less.
- Never exceed 8 questions. Never fewer than 3.

Make the questions specific to THIS idea, not generic. The wording should show you
understood their idea.

For each question, provide 3 to 4 tappable answer options plus allow a custom
answer. Options must be short, mutually exclusive, and cover the realistic range.

Return ONLY valid JSON, no preamble, no markdown, in exactly this shape:
{
  "questions": [
    {
      "id": "products",
      "question": "Which products will you sell first?",
      "options": ["Hair oil", "Shampoo and conditioner", "Edge control", "A full range"]
    }
  ]
}

Writing rules for every question and option you output:
- Do NOT use em dashes anywhere. Do not use en dashes as substitutes either.
  Use periods, commas, or separate sentences instead.
- Plain, direct language. No filler, no marketing voice.
- Sentence case. Keep each question under about 12 words.
- Address the user as "you." Name things the way a user would, not the system.
"""

# Second discovery pass: turn the idea + answers into a structured understanding
# that flows into every downstream agent and (later) the image resolver.
CONTEXT_SYSTEM = """You are a product discovery synthesizer. Given a product idea
and the user's answers to clarifying questions, output a structured understanding
of what to build. Return ONLY valid JSON, no preamble, no markdown, in this shape:
{
  "products": [
    {
      "name": "Hydrating Hair Oil",
      "packaging": "amber glass dropper bottle",
      "visual_description": "a 60ml amber glass dropper bottle of hair oil with a matte black dropper cap and a minimal cream label, on a soft beige studio backdrop, warm diffused lighting, luxury natural skincare aesthetic"
    }
  ],
  "brand_feel": "luxury minimal, warm and natural",
  "target_audience": "women with natural and curly hair",
  "key_pages": ["Home", "Shop", "Product detail", "Cart", "Checkout"]
}

Rules:
- products: the actual items or core entities of THIS product. For a store, the
  things sold. For a tool, its core objects. 1 to 8 items.
- packaging: the physical form or how each item is presented. Use an empty string
  if the product is not physical.
- visual_description: detailed enough to use directly as an image generation
  prompt. Name materials, setting, lighting, and branding style. Match what the
  user described. Do not invent a different product than they asked for.
- Infer sensible values from the idea and answers. Do not ask questions.
- Do NOT use em dashes or en dashes anywhere.
"""


def _extract_json(text: str) -> str | None:
    """Return the JSON blob from a model reply, tolerating fences and prose."""
    raw = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*\n([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    if raw.startswith("{"):
        return raw
    brace = re.search(r"\{[\s\S]*\}", raw)
    return brace.group(0) if brace else None


def _parse_questions(text: str) -> list[dict]:
    """Pull the questions array out of the model's reply, tolerating fences."""
    raw = _extract_json(text)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    out: list[dict] = []
    for i, q in enumerate((data or {}).get("questions", [])[:8]):
        question = str(q.get("question", "")).strip()
        options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        if not question or len(options) < 2:
            continue
        out.append(
            {
                "id": str(q.get("id") or f"q{i + 1}"),
                "question": question,
                "options": options[:4],
            }
        )
    return out


def _parse_context(text: str) -> dict:
    """Parse the structured product-understanding object, tolerating fences."""
    raw = _extract_json(text)
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    products: list[dict] = []
    for p in (data.get("products") or [])[:8]:
        if not isinstance(p, dict):
            continue
        name = str(p.get("name", "")).strip()
        if not name:
            continue
        products.append(
            {
                "name": name,
                "packaging": str(p.get("packaging", "")).strip(),
                "visual_description": str(p.get("visual_description", "")).strip(),
            }
        )
    key_pages = [str(k).strip() for k in (data.get("key_pages") or []) if str(k).strip()]
    return {
        "products": products,
        "brand_feel": str(data.get("brand_feel", "")).strip(),
        "target_audience": str(data.get("target_audience", "")).strip(),
        "key_pages": key_pages[:12],
    }


async def generate_questions(idea: str, router: ModelRouter) -> list[dict]:
    """Ask the PM-route model for clarifying questions. Empty list on failure,
    so the frontend can skip the step rather than block the run."""
    user = f'User\'s product idea:\n"""\n{idea.strip()}\n"""'
    candidates = router.chain("cloud-pm")
    try:
        chunks: list[str] = []
        async for kind, payload in router.stream_chain(candidates, CLARIFY_SYSTEM, user):
            if kind == "token":
                chunks.append(payload)  # type: ignore[arg-type]
            elif kind == "switch":
                chunks.clear()
        return _parse_questions("".join(chunks))
    except Exception:
        return []


async def build_product_context(idea: str, answers: list[dict], router: ModelRouter) -> dict:
    """Synthesise a structured product-understanding object from idea + answers.

    Returns {} on any failure so the pipeline can continue on the plain idea.
    """
    lines = [
        f"- {a.get('question', '').strip()} {a.get('answer', '').strip()}"
        for a in answers
        if str(a.get("answer", "")).strip()
    ]
    user = (
        f'Idea:\n"""\n{idea.strip()}\n"""\n\nAnswers:\n'
        + ("\n".join(lines) if lines else "(the user did not answer any questions)")
    )
    candidates = router.chain("cloud-pm")
    try:
        chunks: list[str] = []
        async for kind, payload in router.stream_chain(candidates, CONTEXT_SYSTEM, user):
            if kind == "token":
                chunks.append(payload)  # type: ignore[arg-type]
            elif kind == "switch":
                chunks.clear()
        return _parse_context("".join(chunks))
    except Exception:
        return {}


def render_context(context: dict) -> str:
    """A compact text rendering of the product context for the LLM agents."""
    if not context:
        return ""
    parts = ["Product understanding (treat these as firm requirements):"]
    if context.get("target_audience"):
        parts.append(f"- Audience: {context['target_audience']}")
    if context.get("brand_feel"):
        parts.append(f"- Brand feel: {context['brand_feel']}")
    if context.get("key_pages"):
        parts.append(f"- Key pages: {', '.join(context['key_pages'])}")
    products = context.get("products") or []
    if products:
        parts.append("- Products / core items:")
        for p in products:
            pack = p.get("packaging")
            parts.append(f"  - {p['name']}" + (f" ({pack})" if pack else ""))
    return "\n".join(parts)


def fold_answers_into_idea(idea: str, answers: list[dict]) -> str:
    """Append the user's clarifying answers to the idea so every agent sees them."""
    lines = []
    for a in answers:
        q = str(a.get("question", "")).strip()
        ans = str(a.get("answer", "")).strip()
        if q and ans:
            lines.append(f"- {q} {ans}")
    if not lines:
        return idea
    return (
        idea.strip()
        + "\n\nThe user answered these clarifying questions. Treat the answers as "
        "requirements:\n" + "\n".join(lines)
    )
