export const DEFAULT_DEEPSEEK_TEXT_MODEL = "deepseek-v4-flash";
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export interface DeepSeekJsonGenerationOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  temperature?: number;
  maxTokens?: number;
}

export async function generateDeepSeekJsonText(
  prompt: string,
  options: DeepSeekJsonGenerationOptions = {}
): Promise<string> {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured, so assisted generation is unavailable.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/$/, "");
  const model = options.model ?? process.env.DEEPSEEK_TEXT_MODEL ?? DEFAULT_DEEPSEEK_TEXT_MODEL;
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You produce strict JSON for a parent-reviewed British English learning app. Return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 1600,
      stream: false
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`DeepSeek text generation failed (${response.status}): ${body.slice(0, 600)}`);
  }

  const json = (await response.json()) as DeepSeekChatCompletionResponse;
  return extractDeepSeekText(json);
}

function extractDeepSeekText(response: DeepSeekChatCompletionResponse): string {
  for (const choice of response.choices ?? []) {
    const content = choice.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content;
    }
  }
  throw new Error("DeepSeek text generation returned no draft content.");
}

interface DeepSeekChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}
