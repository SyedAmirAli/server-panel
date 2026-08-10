import { Inject, Injectable, Logger } from "@nestjs/common";
import {
    ChatMessage,
    CompletionOptions,
    CompletionResult,
    LLM_PROVIDER,
    LlmProvider,
    LlmResponseError,
} from "@/modules/job-finder/llm/llm.types";

/**
 * Thin orchestration layer over whichever `LlmProvider` is bound.
 *
 * Everything in this module that needs a model goes through here, so retries,
 * JSON coercion and logging live in exactly one place.
 */
@Injectable()
export class LlmService {
    private readonly logger = new Logger(LlmService.name);

    constructor(@Inject(LLM_PROVIDER) private readonly provider: LlmProvider) {}

    isConfigured(): boolean {
        return this.provider.isConfigured();
    }

    get providerName(): string {
        return this.provider.name;
    }

    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult> {
        return this.provider.complete(messages, options);
    }

    /**
     * Complete and parse a JSON object.
     *
     * Models routed through a gateway are inconsistent about honouring
     * `response_format` — some fence the JSON, some prepend prose, some emit
     * reasoning first. `extractJson` handles those shapes; a failed parse is
     * retried once with an explicit correction turn before giving up.
     */
    /**
     * Stream a completion, calling `onToken` as text arrives. Falls back to a
     * single non-streaming call when the provider cannot stream, so callers get
     * one code path either way.
     */
    async completeStream(
        messages: ChatMessage[],
        onToken: (chunk: string) => void,
        options: CompletionOptions = {}
    ): Promise<CompletionResult> {
        if (this.provider.completeStream) {
            return this.provider.completeStream(messages, onToken, options);
        }
        const result = await this.provider.complete(messages, options);
        onToken(result.text);
        return result;
    }

    async completeJson<T>(
        messages: ChatMessage[],
        options: CompletionOptions = {}
    ): Promise<{ value: T; result: CompletionResult }> {
        const opts: CompletionOptions = { ...options, json: true };
        const result = await this.provider.complete(messages, opts);

        try {
            return { value: extractJson<T>(result.text), result };
        } catch (first) {
            this.logger.warn(`LLM JSON parse failed, retrying once: ${(first as Error).message}`);

            const retry = await this.provider.complete(
                [
                    ...messages,
                    { role: "assistant", content: result.text.slice(0, 4000) },
                    {
                        role: "user",
                        content:
                            "That was not valid JSON. Reply with the JSON object only — " +
                            "no prose, no markdown fences, no explanation.",
                    },
                ],
                opts
            );

            try {
                return { value: extractJson<T>(retry.text), result: retry };
            } catch (second) {
                throw new LlmResponseError(
                    `LLM did not return parseable JSON after a retry: ${(second as Error).message}`,
                    retry.text.slice(0, 2000)
                );
            }
        }
    }
}

/**
 * Pull a JSON object/array out of a model response.
 *
 * Tries the whole string first, then a fenced block, then the widest balanced
 * brace/bracket span — which survives both leading prose and trailing commentary.
 */
export function extractJson<T>(text: string): T {
    const trimmed = text.trim();

    const direct = tryParse<T>(trimmed);
    if (direct.ok) return direct.value;

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
        const parsed = tryParse<T>(fenced[1].trim());
        if (parsed.ok) return parsed.value;
    }

    for (const [open, close] of [
        ["{", "}"],
        ["[", "]"],
    ] as const) {
        const start = trimmed.indexOf(open);
        const end = trimmed.lastIndexOf(close);
        if (start !== -1 && end > start) {
            const parsed = tryParse<T>(trimmed.slice(start, end + 1));
            if (parsed.ok) return parsed.value;
        }
    }

    throw new Error(`no JSON object found in response (${trimmed.length} chars)`);
}

function tryParse<T>(candidate: string): { ok: true; value: T } | { ok: false } {
    if (!candidate) return { ok: false };
    try {
        return { ok: true, value: JSON.parse(candidate) as T };
    } catch {
        return { ok: false };
    }
}
