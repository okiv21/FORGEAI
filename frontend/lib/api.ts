/**
 * Base URL for the FastAPI backend.
 *
 * We call the backend DIRECTLY (not via a Next.js rewrite) because Next's dev
 * proxy buffers streaming responses, which would break the live SSE updates
 * that drive the agent timeline and preview. CORS for localhost:3000 is enabled
 * on the backend (see backend/main.py).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";
