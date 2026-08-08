/**
 * Provider-agnostic LLM contract for the Job Finder module.
 *
 * Nothing outside `llm/` may import a vendor SDK or hand-roll an HTTP call to a
 * model host. Swapping providers means adding one class that implements
 * `LlmProvider` and binding it in `job-finder.module.ts` — no call site changes.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
    role: ChatRole;
    content: string;
}

export interface CompletionOptions {
    /** Provider model id. Falls back to the provider's configured default. */
    model?: string;
    temperature?: number;
    maxTokens?: number;
    /** Ask the provider for strict JSON where it supports it. */
    json?: boolean;
    /** Abort the request after this many ms. */
    timeoutMs?: number;
}

export interface CompletionResult {
    text: string;
    model: string;
    /** Present only when the provider reports usage. */
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    /** Grounded/search models return the pages they consulted. */
    citations?: string[];
}

export interface LlmProvider {
    readonly name: string;
    /** Model used when a caller passes none. */
    readonly defaultModel: string;
    /** False when the provider is unconfigured — callers should degrade, not throw. */
    isConfigured(): boolean;
    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
}

/** DI token — inject the interface, never a concrete provider class. */
export const LLM_PROVIDER = Symbol("LLM_PROVIDER");

/** Raised when a provider is reachable but the response is unusable. */
export class LlmResponseError extends Error {
    constructor(
        message: string,
        public readonly raw?: string
    ) {
        super(message);
        this.name = "LlmResponseError";
    }
}
