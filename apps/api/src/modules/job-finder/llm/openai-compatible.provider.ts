import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    ChatMessage,
    CompletionOptions,
    CompletionResult,
    LlmProvider,
    LlmResponseError,
} from "@/modules/job-finder/llm/llm.types";

/**
 * Default `LlmProvider`: any OpenAI-compatible `/chat/completions` endpoint.
 *
 * Configured here against the self-hosted OmniRoute gateway (`AI_BASE_URL` /
 * `AI_API_KEY`), which fronts many upstream models behind one API — including
 * the grounded search models the web-search job source relies on.
 */
@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
    readonly name = "openai-compatible";
    private readonly logger = new Logger(OpenAiCompatibleProvider.name);

    private readonly baseUrl: string;
    private readonly apiKey: string;
    readonly defaultModel: string;

    constructor(private readonly config: ConfigService) {
        this.baseUrl = normalizeBaseUrl(this.config.get<string>("AI_BASE_URL") ?? "");
        this.apiKey = this.config.get<string>("AI_API_KEY") ?? "";
        this.defaultModel = this.config.get<string>("AI_DEFAULT_MODEL") ?? "auto/best-fast";

        if (!this.isConfigured()) {
            this.logger.warn(
                "AI_BASE_URL / AI_API_KEY not set — Job Finder scoring and application drafting will be unavailable."
            );
        }
    }

    isConfigured(): boolean {
        return Boolean(this.baseUrl && this.apiKey);
    }

    async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<CompletionResult> {
        if (!this.isConfigured()) {
            throw new LlmResponseError("LLM provider is not configured (AI_BASE_URL / AI_API_KEY missing).");
        }

        const model = options.model || this.defaultModel;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);

        try {
            const res = await fetch(`${this.baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: options.temperature ?? 0.2,
                    max_tokens: options.maxTokens,
                    // Not every upstream honours this; the JSON extractor downstream
                    // is written to cope when it doesn't.
                    ...(options.json ? { response_format: { type: "json_object" } } : {}),
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const body = await res.text().catch(() => "");
                throw new LlmResponseError(
                    `LLM request failed (${res.status} ${res.statusText}) for model "${model}"`,
                    body.slice(0, 2000)
                );
            }

            const payload = (await res.json()) as ChatCompletionPayload;
            const choice = payload.choices?.[0];
            const text = choice?.message?.content;

            if (typeof text !== "string" || !text.trim()) {
                throw new LlmResponseError(
                    `LLM returned an empty completion for model "${model}"`,
                    JSON.stringify(payload).slice(0, 2000)
                );
            }

            return {
                text,
                model: payload.model || model,
                usage: payload.usage && {
                    promptTokens: payload.usage.prompt_tokens,
                    completionTokens: payload.usage.completion_tokens,
                    totalTokens: payload.usage.total_tokens,
                },
                citations: extractCitations(payload),
            };
        } catch (err) {
            if (err instanceof LlmResponseError) throw err;
            if ((err as Error)?.name === "AbortError") {
                throw new LlmResponseError(`LLM request timed out for model "${model}"`);
            }
            throw new LlmResponseError(`LLM request errored for model "${model}": ${(err as Error).message}`);
        } finally {
            clearTimeout(timeout);
        }
    }
}

/**
 * `0.0.0.0` is a bind address, not a dial address — it fails on several Node/OS
 * combinations. The gateway's own .env advertises it, so rewrite it to loopback.
 */
function normalizeBaseUrl(raw: string): string {
    return raw.trim().replace(/\/+$/, "").replace("//0.0.0.0:", "//127.0.0.1:");
}

/** Grounded models report sources in varying shapes; collect whichever is present. */
function extractCitations(payload: ChatCompletionPayload): string[] | undefined {
    const fromRoot = Array.isArray(payload.citations) ? payload.citations : [];
    const fromChoice = payload.choices?.[0]?.message?.citations ?? [];
    const all = [...fromRoot, ...fromChoice].filter((c): c is string => typeof c === "string");
    return all.length ? Array.from(new Set(all)) : undefined;
}

interface ChatCompletionPayload {
    model?: string;
    citations?: unknown[];
    choices?: Array<{ message?: { content?: string; citations?: unknown[] } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}
