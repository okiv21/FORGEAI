"""
List the OpenRouter models that are FREE on your account right now.

Reads OPENROUTER_API_KEY from backend/.env, queries OpenRouter, and prints only
models whose per-token price is exactly $0 — grouped into coding models (best for
the Frontend/Backend agents) and general/reasoning models (best for the Product
Manager and Code Reviewer agents).

Usage:
    .venv\\Scripts\\python.exe list_free_models.py
"""
import asyncio

from model_router import ModelRouter

CODING_HINTS = ("cod", "coder", "laguna", "qwen", "devstral", "codestral")

# Free lineups include non-chat models (music, image, guardrails). Sending a chat
# completion to those fails, so keep them out of suggestions entirely.
NON_CHAT_HINTS = (
    "lyria",      # music generation
    "clip",       # audio/video clip models
    "content-safety",  # moderation guardrail
    "whisper",
    "tts",
    "embed",
    "rerank",
    "image",
    "diffusion",
)


def is_chat(m: dict) -> bool:
    blob = f"{m['id']} {m['name']}".lower()
    return not any(h in blob for h in NON_CHAT_HINTS)


def is_coding(m: dict) -> bool:
    blob = f"{m['id']} {m['name']}".lower()
    return any(h in blob for h in CODING_HINTS)


async def main() -> None:
    router = ModelRouter()
    if not router.openrouter_key:
        print("No OPENROUTER_API_KEY found in backend/.env — add it and re-run.")
        return

    try:
        free = await router.list_openrouter_free()
    except Exception as exc:
        print(f"Failed to fetch models: {type(exc).__name__}: {exc}")
        return

    if not free:
        print("No zero-cost models returned (the free lineup may have changed).")
        return

    chat = [m for m in free if is_chat(m)]
    coding = [m for m in chat if is_coding(m)]
    general = [m for m in chat if not is_coding(m)]

    def show(title: str, items: list[dict]) -> None:
        print(f"\n{title} ({len(items)})")
        print("-" * len(title))
        for m in items:
            ctx = f"{m['context']:,}" if m["context"] else "?"
            print(f"  {m['id']:<52} ctx={ctx}")

    print(f"\n{len(free)} FREE models available on your OpenRouter account.\n")
    print("Suggested .env settings:")
    if coding:
        print(f"  OPENROUTER_FRONTEND_MODEL={coding[0]['id']}")
    if general:
        print(f"  OPENROUTER_PM_MODEL={general[0]['id']}")
        print(f"  OPENROUTER_REVIEWER_MODEL={general[0]['id']}")

    show("CODING models (Frontend / Backend)", coding)
    show("GENERAL / REASONING models (PM / Reviewer)", general)


if __name__ == "__main__":
    asyncio.run(main())
