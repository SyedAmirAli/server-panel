/**
 * Provider-agnostic LLM contract for the Job Finder module.
 *
 * Nothing outside `llm/` may import a vendor SDK or hand-roll an HTTP call to a
 * model host. Swapping providers means adding one class that implements
 * `LlmProvider` and binding it in `job-finder.module.ts` — no call site changes.
 */

export type ChatRole = "system" | "user" | "assistant";

/**
 * A multimodal content part, in the OpenAI-compatible shape. Only needed for
 * vision calls (OCR); text-only callers keep passing a plain string.
 */
export type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export interface ChatMessage {
    role: ChatRole;
    /**
     * A plain string for ordinary calls. The array form carries images for
     * vision models — widened rather than replaced, so every existing text-only
     * call site is untouched.
     */
    content: string | ContentPart[];
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

/** Receives each chunk of text as the model produces it. */
export type TokenHandler = (chunk: string) => void;

export interface LlmProvider {
    readonly name: string;
    /** Model used when a caller passes none. */
    readonly defaultModel: string;
    /** False when the provider is unconfigured — callers should degrade, not throw. */
    isConfigured(): boolean;
    complete(messages: ChatMessage[], options?: CompletionOptions): Promise<CompletionResult>;
    /**
     * Same as {@link complete}, but invokes `onToken` as text arrives. Optional:
     * a provider that cannot stream simply omits it and callers fall back.
     */
    completeStream?(
        messages: ChatMessage[],
        onToken: TokenHandler,
        options?: CompletionOptions
    ): Promise<CompletionResult>;
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
