export const aiProviders = {
  google: "Google (Gemini)",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
} as const;

export type AiProvider = keyof typeof aiProviders;
export type AiModel = { id: string; name: string };
