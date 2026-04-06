/**
 * GPT Service - Direct OpenAI API integration for intelligent email generation.
 * Uses GPT-4o for chain-of-thought reasoning, structured JSON output, and
 * more nuanced analysis than the built-in LLM.
 */
import { ENV } from "../_core/env";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export interface GPTMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string }; file_url?: { url: string; mime_type?: string } }>;
}

export interface GPTOptions {
  messages: GPTMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string; json_schema?: Record<string, unknown> };
}

export interface GPTResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Invoke GPT model directly via OpenAI API.
 * Falls back to built-in LLM if OpenAI key is not configured.
 */
export async function invokeGPT(options: GPTOptions): Promise<GPTResponse> {
  const apiKey = ENV.openaiApiKey;

  // If no OpenAI key, fall back to built-in LLM
  if (!apiKey) {
    const { invokeLLM } = await import("../_core/llm");
    return invokeLLM(options as any) as Promise<GPTResponse>;
  }

  const body: Record<string, unknown> = {
    model: options.model || "gpt-4o",
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
  };

  if (options.max_tokens) {
    body.max_tokens = options.max_tokens;
  }

  if (options.response_format) {
    body.response_format = options.response_format;
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[GPT] API error:", response.status, errorText);
    // Fall back to built-in LLM on error
    console.warn("[GPT] Falling back to built-in LLM");
    const { invokeLLM } = await import("../_core/llm");
    return invokeLLM(options as any) as Promise<GPTResponse>;
  }

  return response.json() as Promise<GPTResponse>;
}

/**
 * Quick helper for simple text completion with GPT.
 */
export async function gptComplete(systemPrompt: string, userPrompt: string, options?: Partial<GPTOptions>): Promise<string> {
  const result = await invokeGPT({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    ...options,
  });
  return result.choices[0]?.message?.content || "";
}

/**
 * GPT with structured JSON output.
 */
export async function gptJSON<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>,
  options?: Partial<GPTOptions>
): Promise<T> {
  const result = await invokeGPT({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
    temperature: 0.5,
    ...options,
  });
  const content = result.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as T;
}

/**
 * Validate OpenAI API key by making a lightweight models list call.
 */
export async function validateOpenAIKey(): Promise<{ valid: boolean; error?: string }> {
  const apiKey = ENV.openaiApiKey;
  if (!apiKey) return { valid: false, error: "No API key configured" };

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    if (response.ok) return { valid: true };
    return { valid: false, error: `API returned ${response.status}` };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}
