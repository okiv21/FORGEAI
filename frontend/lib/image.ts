/**
 * Free, no-key text-to-image for mood boards / mascots (FLUX).
 *
 * Per the project plan, image generation is used ONLY for inspiration visuals,
 * never for functional UI specs. We default to Pollinations' FLUX endpoint,
 * which needs no API key. Override the host with NEXT_PUBLIC_IMAGE_BASE if you
 * later host FLUX.1 Dev on your own free Hugging Face Space.
 */
const IMAGE_BASE =
  process.env.NEXT_PUBLIC_IMAGE_BASE?.replace(/\/$/, "") ||
  "https://image.pollinations.ai/prompt";

export function fluxImageUrl(
  prompt: string,
  opts: { w?: number; h?: number; seed?: number } = {}
): string {
  const { w = 640, h = 640, seed = 0 } = opts;
  return `${IMAGE_BASE}/${encodeURIComponent(prompt)}?model=flux&width=${w}&height=${h}&nologo=true&seed=${seed}`;
}
