import type { AiProviderName, ProviderProtocol } from '../types.js';
import { OpenAiCompatibleClient } from '../openai-compatible-client.js';

export type ContentFactoryAiPurpose = 'AUTHOR_GRAMMAR' | 'AUTHOR_EXERCISES' | 'REVIEW';

export interface ContentFactoryJsonRequest {
  purpose: ContentFactoryAiPurpose;
  system: string;
  input: string;
}

export interface ContentFactoryJsonProvider {
  readonly provider: AiProviderName;
  readonly model: string;
  generateJson(request: ContentFactoryJsonRequest): Promise<unknown>;
}

type ChatPayload = { choices?: Array<{ message?: { content?: string } }> };
type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
};

/**
 * Real provider adapter used by Content Factory author/reviewer paths. It keeps
 * provider transport outside domain authoring code and returns only parsed JSON,
 * never raw authorization headers or provider envelopes for persistence.
 */
export class OpenAiCompatibleJsonProvider implements ContentFactoryJsonProvider {
  constructor(
    private readonly client: OpenAiCompatibleClient,
    public readonly provider: AiProviderName,
    public readonly model: string,
    private readonly protocol: Extract<ProviderProtocol, 'RESPONSES' | 'CHAT_COMPLETIONS'>,
  ) {}

  public async generateJson(request: ContentFactoryJsonRequest): Promise<unknown> {
    const result =
      this.protocol === 'RESPONSES'
        ? await this.client.createResponse(this.model, request.system, request.input, {
            format: { type: 'json_object' },
          })
        : await this.client.chatCompletion(
            this.model,
            [
              { role: 'system', content: request.system },
              { role: 'user', content: request.input },
            ],
            { type: 'json_object' },
          );

    if (!result.ok) {
      throw new Error(
        `CONTENT_FACTORY_PROVIDER_FAILED:${request.purpose}:${result.errorCode ?? 'UNKNOWN'}`,
      );
    }

    return this.extractJson(result.value);
  }

  private extractJson(payload: unknown): unknown {
    const responses = payload as ResponsesPayload;
    const content =
      (payload as ChatPayload).choices?.[0]?.message?.content ??
      responses.output_text ??
      responses.output?.flatMap((item) => item.content ?? []).find((item) => item.text)?.text;

    if (!content) throw new Error('CONTENT_FACTORY_PROVIDER_EMPTY_RESPONSE');
    const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned) as unknown;
  }
}
