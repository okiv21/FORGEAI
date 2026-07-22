"""
Deterministic image resolver (a code service, NOT an agent).

The Frontend agent marks each image slot with an intent so this layer can fill it
from the cheapest adequate source:

    __IMG[stock|hair salon interior]__   -> free stock photo (Pexels) by keyword
    __IMG[avatar|Jane D]__               -> free generated avatar (DiceBear)
    __IMG[custom|0]__                    -> branded image generated from the
                                            product-understanding context (index),
                                            or from an inline prompt after the pipe

Only "custom" slots trigger a paid image generation, and only up to a small cap,
so paid calls stay rare and deliberate. Uploaded user photos keep using the
separate __USER_IMAGE_n__ convention handled on the client.

All tiers degrade gracefully: a missing API key or a failed call yields a neutral
placeholder rather than raising, so a run or export never breaks on imagery.
"""
from __future__ import annotations

import asyncio
import os
import re
from urllib.parse import quote

import httpx

SLOT_RE = re.compile(r"__IMG\[(stock|avatar|custom)\|([^\]]*)\]__")

# Neutral gray placeholder used whenever a tier can't produce an image.
PLACEHOLDER = (
    "data:image/svg+xml," + quote(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">'
        '<rect width="100%" height="100%" fill="#0a0f1a"/>'
        '<text x="50%" y="50%" fill="#3c78be" font-family="sans-serif" '
        'font-size="16" text-anchor="middle" dominant-baseline="middle">image</text>'
        "</svg>"
    )
)


def _env(key: str, default: str = "") -> str:
    return (os.getenv(key) or default).strip()


def find_slots(text: str) -> list[str]:
    """Return the unique raw slot tokens present in the text."""
    if not text:
        return []
    seen: dict[str, None] = {}
    for m in SLOT_RE.finditer(text):
        seen.setdefault(m.group(0), None)
    return list(seen.keys())


def _dicebear_url(seed: str) -> str:
    seed = seed.strip() or "user"
    return f"https://api.dicebear.com/9.x/avataaars/svg?seed={quote(seed)}"


async def _pexels_photo(query: str, client: httpx.AsyncClient) -> str:
    """First landscape stock photo for a keyword, or a placeholder."""
    key = _env("PEXELS_API_KEY")
    q = query.strip()
    if not key or not q:
        return PLACEHOLDER
    try:
        r = await client.get(
            "https://api.pexels.com/v1/search",
            headers={"Authorization": key},
            params={"query": q, "per_page": 1, "orientation": "landscape"},
            timeout=15,
        )
        r.raise_for_status()
        photos = r.json().get("photos", [])
        if photos:
            src = photos[0].get("src", {})
            return src.get("large") or src.get("original") or PLACEHOLDER
    except Exception:
        pass
    return PLACEHOLDER


async def _generate_image(prompt: str, client: httpx.AsyncClient) -> str:
    """Generate a branded image via an OpenRouter image model. Data URL or placeholder.

    OpenRouter image models return generated images on the chat-completions
    response as message.images[].image_url.url (a data URL).
    """
    key = _env("OPENROUTER_API_KEY")
    prompt = prompt.strip()
    if not key or not prompt:
        return PLACEHOLDER
    base = _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    model = _env("IMAGE_GEN_MODEL", "openai/gpt-5-image-mini")
    try:
        r = await client.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "modalities": ["image", "text"],
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=90,
        )
        r.raise_for_status()
        msg = (r.json().get("choices") or [{}])[0].get("message", {}) or {}
        for img in msg.get("images") or []:
            url = (img.get("image_url") or {}).get("url")
            if url:
                return url
    except Exception:
        pass
    return PLACEHOLDER


def _custom_prompt(arg: str, product_context: dict) -> str:
    """Build the generation prompt for a custom slot.

    If the arg is an index (or a product name) it pulls the detailed
    visual_description from the product-understanding context; otherwise the arg
    itself is used as the prompt.
    """
    products = (product_context or {}).get("products") or []
    arg = arg.strip()
    chosen: dict | None = None
    if arg.isdigit() and int(arg) < len(products):
        chosen = products[int(arg)]
    else:
        for p in products:
            if p.get("name", "").lower() == arg.lower():
                chosen = p
                break
    if chosen:
        desc = chosen.get("visual_description") or chosen.get("name", "")
        brand = (product_context or {}).get("brand_feel")
        return f"{desc}. {brand} aesthetic. Product photography, no text overlay." if brand else desc
    # Fall back to treating the arg as a literal prompt.
    return arg


async def resolve_images(
    text: str, product_context: dict | None = None, max_custom: int = 4
) -> dict[str, str]:
    """Resolve every image slot in the text to a URL. Returns {slot: url}.

    Paid custom generations are capped at max_custom; extra custom slots reuse the
    generated images round-robin so a large catalog still gets branded imagery
    without unbounded spend.
    """
    product_context = product_context or {}
    slots = find_slots(text)
    if not slots:
        return {}

    resolved: dict[str, str] = {}
    custom_slots: list[tuple[str, str]] = []  # (slot, prompt)

    async with httpx.AsyncClient() as client:
        # Instant / free tiers first.
        stock_tasks: dict[str, asyncio.Task] = {}
        for slot in slots:
            m = SLOT_RE.fullmatch(slot)
            if not m:
                continue
            intent, arg = m.group(1), m.group(2)
            if intent == "avatar":
                resolved[slot] = _dicebear_url(arg)
            elif intent == "stock":
                stock_tasks[slot] = asyncio.create_task(_pexels_photo(arg, client))
            elif intent == "custom":
                custom_slots.append((slot, _custom_prompt(arg, product_context)))

        for slot, task in stock_tasks.items():
            resolved[slot] = await task

        # Paid tier, bounded and concurrent. Generate the first max_custom unique
        # prompts in parallel, then map any remaining custom slots onto those.
        head = custom_slots[:max_custom]
        generated = await asyncio.gather(
            *(_generate_image(prompt, client) for _, prompt in head)
        )
        for (slot, _), img in zip(head, generated):
            resolved[slot] = img
        for i, (slot, _) in enumerate(custom_slots[max_custom:]):
            resolved[slot] = generated[i % len(generated)] if generated else PLACEHOLDER

    return resolved


def apply_resolved(text: str, resolved: dict[str, str]) -> str:
    """Replace slot tokens with their resolved URLs; unknown slots get a placeholder."""
    if not text:
        return text
    return SLOT_RE.sub(
        lambda m: resolved.get(m.group(0), PLACEHOLDER),
        text,
    )
