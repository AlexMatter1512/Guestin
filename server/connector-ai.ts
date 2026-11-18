import { z } from "zod";
import {
  aiProviders,
  type AiModel,
  type AiProvider,
} from "../shared/ai-providers";

const baseUrls = {
  google: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openai: "https://api.openai.com/v1/",
  anthropic: "https://api.anthropic.com/v1/",
} satisfies Record<AiProvider, string>;

export const aiProvider = z.enum(Object.keys(aiProviders) as AiProvider[]);
export const aiKey = z
  .string()
  .trim()
  .min(1)
  .max(4096)
  .regex(/^[!-~]+$/, "Enter a valid API token");
const modelId = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[!-~]+$/);
export const aiConfiguration = z.object({
  provider: aiProvider,
  model: modelId,
});

const catalog = z.object({
  data: z.array(z.object({ id: modelId, display_name: z.string().optional() })),
  has_more: z.boolean().optional(),
  last_id: z.string().nullish(),
});
const completion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().trim().min(1) }),
      }),
    )
    .min(1),
});

type FetchResponse = (
  url: string,
  init?: RequestInit,
) => Promise<{ status: number; text: string }>;
type Fail = (message: string, status?: number) => never;

async function requestJson(
  fetchResponse: FetchResponse,
  url: URL,
  init: RequestInit,
  fail: Fail,
  operation: "models" | "extraction",
): Promise<unknown> {
  let response: Awaited<ReturnType<FetchResponse>>;
  try {
    response = await fetchResponse(url.href, init);
  } catch {
    fail("Could not reach the AI provider. Try again.", 502);
  }
  if (response.status === 401 || response.status === 403)
    fail("The AI provider rejected the token or access to this resource.", 400);
  if (response.status === 429)
    fail("The AI provider rate limit or quota was reached.", 429);
  if (
    response.status >= 400 &&
    response.status < 500 &&
    operation === "extraction"
  )
    fail(
      "The AI provider rejected the request. Check that the selected model supports image input.",
      400,
    );
  if (response.status !== 200)
    fail("The AI provider request failed. Try again.", 502);
  try {
    return JSON.parse(response.text);
  } catch {
    fail("The AI provider returned an invalid response.", 502);
  }
}

export async function listAiModels(
  provider: AiProvider,
  key: string,
  fetchResponse: FetchResponse,
  fail: Fail,
): Promise<AiModel[]> {
  const url = new URL("models", baseUrls[provider]);
  const headers: Record<string, string> =
    provider === "anthropic"
      ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${key}` };
  if (provider === "anthropic") url.searchParams.set("limit", "100");
  const models = new Map<string, AiModel>();
  // Bound pagination and reject a repeated cursor.
  for (let page = 0; page < 10; page++) {
    const result = catalog.safeParse(
      await requestJson(fetchResponse, url, { headers }, fail, "models"),
    );
    if (!result.success)
      fail("The AI provider returned an invalid model list.", 502);
    for (const model of result.data.data) {
      const id =
        provider === "google" ? model.id.replace(/^models\//, "") : model.id;
      if (id) models.set(id, { id, name: model.display_name || id });
    }
    if (provider !== "anthropic" || !result.data.has_more)
      return Array.from(models.values()).sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      );
    const cursor = result.data.last_id;
    if (!cursor || cursor === url.searchParams.get("after_id")) break;
    url.searchParams.set("after_id", cursor);
  }
  return fail("The AI provider returned an incomplete model list.", 502);
}

export async function extractAiImage(
  configuration: z.infer<typeof aiConfiguration>,
  key: string,
  input: { image: string; mime: string; prompt: string },
  fetchResponse: FetchResponse,
  fail: Fail,
) {
  const { provider, model } = configuration;
  const response = await requestJson(
    fetchResponse,
    new URL("chat/completions", baseUrls[provider]),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        ...(provider === "google"
          ? { max_tokens: 4096 }
          : { max_completion_tokens: 4096 }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  input.prompt +
                  "\nReturn only the JSON object, without markdown or commentary.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${input.mime};base64,${input.image}` },
              },
            ],
          },
        ],
      }),
    },
    fail,
    "extraction",
  );
  const result = completion.safeParse(response);
  if (!result.success)
    fail("The AI provider did not return extracted details.", 502);
  return result.data.choices[0].message.content;
}
