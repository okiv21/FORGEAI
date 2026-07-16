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

CLARIFY_SYSTEM = """Generate 3 to 4 clarifying
questions that most change what gets built. Prioritize questions whose answers
have the biggest downstream impact on the product requirements, data schema,
backend, and scope. Skip anything the user's idea already answers.

Aim your questions at these high-leverage axes, adapted to the specific idea:
- Who the primary user is (and any distinct secondary user)
- The single core action the product must support
- How it makes money, if at all (free, one-time, subscription, marketplace)
- The build stage and ambition (quick prototype, MVP, production-ready)
- Any hard constraint: a required integration, platform, or non-negotiable feature

Make the questions specific to THIS idea, not generic. If the idea is a hair
product store, ask about inventory size and shipping regions. If it is a meeting
notes tool, ask about transcription source and integrations. The wording should
show you understood their idea.

For each question, provide 3 to 4 tappable answer options plus allow a custom
answer. Options must be short, mutually exclusive, and cover the realistic range.

Return ONLY valid JSON, no preamble, no markdown, in exactly this shape:
{
  "questions": [
    {
      "id": "primary_user",
      "question": "Who is this mainly for?",
      "options": ["Individual shoppers", "Salon professionals", "Both equally"]
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


def _parse_questions(text: str) -> list[dict]:
    """Pull the questions array out of the model's reply, tolerating fences."""
    raw = text.strip()
    fence = re.search(r"```(?:json)?\s*\n([\s\S]*?)```", raw)
    if fence:
        raw = fence.group(1).strip()
    # Fall back to the outermost JSON object if there's stray prose around it.
    if not raw.startswith("{"):
        brace = re.search(r"\{[\s\S]*\}", raw)
        if not brace:
            return []
        raw = brace.group(0)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    out: list[dict] = []
    for i, q in enumerate((data or {}).get("questions", [])[:4]):
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
