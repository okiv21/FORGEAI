"""
Design-taste brief for the UI/UX + Frontend agents.

Distilled from the open-source "tasteskill" anti-slop frontend skill
(github.com/Leonxlnx/taste-skill) and adapted to this project's constraints:
the Frontend agent ships a SELF-CONTAINED HTML mockup (Tailwind via CDN, no npm)
plus a React component. The goal is to stop the generic-AI-design defaults —
purple gradients, three equal cards, Inter + slate, blocky hand-drawn icons —
and produce interfaces that look intentionally designed.

Both agents receive this brief so the UI/UX layout and the built UI stay coherent.
"""

TASTE_BRIEF = """
--- DESIGN TASTE (anti-slop, mandatory) ---

0. DESIGN READ FIRST. Before laying out or coding, infer and state ONE line:
   "Reading this as: <product kind> for <audience>, with a <vibe> language."
   The audience picks the aesthetic, not a default. Then design to that read.

1. ANTI-DEFAULT DISCIPLINE. Do NOT reach for the LLM defaults:
   - No AI-purple / blue glow gradients or neon button glows (THE LILA RULE).
   - No centered hero floating over a dark mesh gradient.
   - No row of three identical equal-width feature cards.
   - No generic glassmorphism slathered on everything.
   - No Inter + slate-900 as the automatic type/color choice.
   Reach past these deliberately based on the design read.

2. TYPOGRAPHY.
   - Give it a real typeface via a Google Fonts <link> in the mockup <head>
     (allowed here since it is a preview): pick a characterful sans display —
     Geist, Outfit, Satoshi, Cabinet Grotesk, Space Grotesk, or similar. Inter
     only if the brief is neutral/accessibility-first.
   - Display/headlines: large and tight — e.g. text-4xl md:text-6xl,
     tracking-tight, leading-[1.05]. Body: text-base leading-relaxed, muted
     color, max-w-[65ch].
   - Serif is VERY discouraged as a default. Use it only for genuinely
     editorial/luxury/heritage briefs, and never Fraunces/Instrument Serif.
   - Emphasis inside a headline = italic or bold of the SAME family, never a
     random serif word dropped into a sans headline.

3. COLOR.
   - Neutral base (zinc / slate / stone), exactly ONE accent, saturation < 80%.
   - Strong singular accents beat purple: emerald, electric blue, deep rose,
     burnt orange, amber, teal. Pick one, LOCK it, use it on the whole page —
     no surprise second accent in a later section.

4. LAYOUT MECHANICS.
   - Contain with max-w-[1400px] mx-auto (or max-w-7xl) and real padding.
   - CSS Grid for multi-column, never flexbox percentage math.
   - Full-height sections use min-h-[100dvh], never h-screen.
   - Generous, consistent whitespace and a clear spacing rhythm. Vary section
     rhythm — do not stack identical bands.

5. ICONS & EMOJI.
   - Use clean, minimal line icons with ONE consistent stroke width (1.5). If
     you must inline SVG, keep it simple and uniform — never blocky, childish,
     or hand-scrawled glyphs. When in doubt, omit the icon rather than draw a
     bad one.
   - No emoji as UI icons unless the brief is explicitly playful/social.

6. DARK MODE by default (unless the brief clearly wants light), with genuine
   contrast — not near-black text on near-black.

7. SUBSTANCE. Fill with realistic product copy and data (never "Lorem ipsum").
   Consider hover, empty, and active states. In the static mockup use tasteful
   CSS transitions only (no JS required to render).
--- END DESIGN TASTE ---
""".strip()
