import Anthropic from "@anthropic-ai/sdk";

// Support two modes:
// 1. Replit AI integration — uses AI_INTEGRATIONS_ANTHROPIC_API_KEY + AI_INTEGRATIONS_ANTHROPIC_BASE_URL
// 2. Standard Anthropic API key — uses ANTHROPIC_API_KEY (no custom base URL)
const apiKey =
  process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY ||
  process.env.ANTHROPIC_API_KEY;

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;

if (!apiKey) {
  throw new Error(
    "An Anthropic API key is required. Set ANTHROPIC_API_KEY (standard) or " +
    "AI_INTEGRATIONS_ANTHROPIC_API_KEY (Replit AI integration).",
  );
}

export const anthropic = new Anthropic({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});
