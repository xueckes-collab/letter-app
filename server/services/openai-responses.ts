import { ENV } from "../_core/env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_RESPONSES_MODEL || "gpt-5.5";
type LlmProvider = "openai" | "deepseek";

export type ResponsesInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface InvokeResponsesBaseOptions {
  model?: string;
  input: ResponsesInputMessage[];
  maxOutputTokens?: number;
  useWebSearch?: boolean;
  requireWebSearch?: boolean;
}

export interface InvokeResponsesJSONOptions<T = unknown> extends InvokeResponsesBaseOptions {
  schemaName: string;
  schema: Record<string, unknown>;
  fallback?: T;
}

function assertOpenAIKey() {
  if (!ENV.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

function resolveProvider(): LlmProvider {
  const configured = ENV.llmProvider.trim().toLowerCase();
  if (configured === "deepseek") return "deepseek";
  if (configured === "openai") return "openai";
  return ENV.deepseekApiKey ? "deepseek" : "openai";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function assertDeepSeekKey() {
  if (!ENV.deepseekApiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;

  const chunks: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

async function invokeResponsesRaw(options: InvokeResponsesBaseOptions & { text?: Record<string, unknown> }) {
  assertOpenAIKey();

  const tools = options.useWebSearch
    ? [{ type: "web_search" as const, external_web_access: true }]
    : undefined;

  const body: Record<string, unknown> = {
    model: options.model || DEFAULT_MODEL,
    input: options.input,
    ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
    ...(tools ? { tools } : {}),
    ...(options.requireWebSearch ? { tool_choice: "required" } : {}),
    ...(options.text ? { text: options.text } : {}),
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Responses API error ${response.status}: ${errorText.slice(0, 1000)}`);
  }

  return response.json();
}

export async function invokeResponsesText(options: InvokeResponsesBaseOptions) {
  if (resolveProvider() === "deepseek") {
    return invokeDeepSeekText(options);
  }

  const payload = await invokeResponsesRaw(options);
  return extractOutputText(payload);
}

export async function invokeResponsesJSON<T = Record<string, unknown>>(options: InvokeResponsesJSONOptions<T>): Promise<T> {
  if (resolveProvider() === "deepseek") {
    return invokeDeepSeekJSON(options);
  }

  const payload = await invokeResponsesRaw({
    ...options,
    text: {
      format: {
        type: "json_schema",
        name: options.schemaName,
        strict: true,
        schema: options.schema,
      },
    },
  });

  const text = extractOutputText(payload);
  if (!text) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error("OpenAI Responses API returned empty structured output");
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error(`Failed to parse Responses JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function invokeDeepSeekText(options: InvokeResponsesBaseOptions) {
  const payload = await invokeDeepSeekChat(options);
  return extractChatMessageText(payload);
}

async function invokeDeepSeekJSON<T = Record<string, unknown>>(options: InvokeResponsesJSONOptions<T>): Promise<T> {
  const schemaPrompt = [
    "Return only a valid JSON object.",
    "Do not wrap the JSON in markdown.",
    `The JSON must match this schema named ${options.schemaName}: ${JSON.stringify(options.schema)}`,
  ].join("\n");

  const payload = await invokeDeepSeekChat({
    ...options,
    input: [
      { role: "system", content: schemaPrompt },
      ...options.input,
    ],
    responseFormat: { type: "json_object" },
  });

  const text = extractChatMessageText(payload);
  if (!text) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error("DeepSeek API returned empty structured output");
  }

  try {
    return JSON.parse(stripJsonFence(text)) as T;
  } catch (error) {
    if (options.fallback !== undefined) return options.fallback;
    throw new Error(`Failed to parse DeepSeek JSON output: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function invokeDeepSeekChat(
  options: InvokeResponsesBaseOptions & { responseFormat?: { type: "json_object" } },
) {
  assertDeepSeekKey();
  if (options.useWebSearch || options.requireWebSearch) {
    throw new Error("DeepSeek provider does not support OpenAI Responses web_search tools");
  }

  const response = await fetch(`${trimTrailingSlash(ENV.deepseekBaseUrl || "https://api.deepseek.com")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.deepseekApiKey}`,
    },
    body: JSON.stringify({
      model: options.model || ENV.deepseekModel || "deepseek-chat",
      messages: options.input,
      ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${errorText.slice(0, 1000)}`);
  }

  return response.json();
}

function extractChatMessageText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  return "";
}

function stripJsonFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
