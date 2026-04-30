import OpenAI from 'openai';
import BaseLLM from '../../base/llm';
import {
  GenerateObjectInput,
  GenerateTextInput,
  GenerateTextOutput,
  StreamTextOutput,
} from '../../types';
import { parse } from 'partial-json';
import z from 'zod';
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/index.mjs';
import { Message } from '@/lib/types';
import { repairJson } from '@toolsycc/json-repair';

type LlamaServerConfig = {
  baseURL: string;
  apiKey?: string;
  model: string;
};

class LlamaServerLLM extends BaseLLM<LlamaServerConfig> {
  openAIClient: OpenAI;

  constructor(protected config: LlamaServerConfig) {
    super(config);

    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    this.openAIClient = new OpenAI({
      apiKey: this.config.apiKey || 'ollama',
      baseURL: this.config.baseURL,
      defaultHeaders: headers,
    });
  }

  convertToOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: msg.id,
          content: msg.content,
        } as ChatCompletionToolMessageParam;
      } else if (msg.role === 'assistant') {
        return {
          role: 'assistant',
          content: msg.content,
          ...(msg.tool_calls &&
            msg.tool_calls.length > 0 && {
              tool_calls: msg.tool_calls?.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }),
        } as ChatCompletionAssistantMessageParam;
      }

      return msg;
    });
  }

  async generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
    const openaiTools: ChatCompletionTool[] = [];

    input.tools?.forEach((tool) => {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema),
        },
      });
    });

    const response = await this.openAIClient.chat.completions.create({
      model: this.config.model,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      messages: this.convertToOpenAIMessages(input.messages),
      temperature: input.options?.temperature ?? 1.0,
      max_completion_tokens: input.options?.maxTokens,
      stop: input.options?.stopSequences,
      stream: false,
    });

    if (response.choices && response.choices.length > 0) {
      return {
        content: response.choices[0].message.content || '',
        toolCalls:
          response.choices[0].message.tool_calls
            ?.map((tc) => {
              if (tc.type === 'function') {
                return {
                  name: tc.function.name,
                  id: tc.id,
                  arguments: JSON.parse(tc.function.arguments),
                };
              }
            })
            .filter((tc) => tc !== undefined) || [],
        additionalInfo: {
          finishReason: response.choices[0].finish_reason,
        },
      };
    }

    throw new Error('No response from LlamaServer');
  }

  async *streamText(
    input: GenerateTextInput,
  ): AsyncGenerator<StreamTextOutput> {
    const openaiTools: ChatCompletionTool[] = [];

    input.tools?.forEach((tool) => {
      openaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: z.toJSONSchema(tool.schema),
        },
      });
    });

    const stream = await this.openAIClient.chat.completions.create({
      model: this.config.model,
      messages: this.convertToOpenAIMessages(input.messages),
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      temperature: input.options?.temperature ?? 1.0,
      max_completion_tokens: input.options?.maxTokens,
      stop: input.options?.stopSequences,
      stream: true,
    });

    let recievedToolCalls: { name: string; id: string; arguments: string }[] =
      [];

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices.length > 0) {
        const toolCalls = chunk.choices[0].delta.tool_calls;
        yield {
          contentChunk: chunk.choices[0].delta.content || '',
          toolCallChunk:
            toolCalls?.map((tc) => {
              if (tc.index === undefined) return undefined;
              if (!recievedToolCalls[tc.index]) {
                const call = {
                  name: tc.function?.name!,
                  id: tc.id!,
                  arguments: tc.function?.arguments || '',
                };
                recievedToolCalls.push(call);
                return { ...call, arguments: parse(call.arguments || '{}') };
              } else {
                const existingCall = recievedToolCalls[tc.index];
                existingCall.arguments += tc.function?.arguments || '';
                return {
                  ...existingCall,
                  arguments: parse(existingCall.arguments),
                };
              }
            }).filter((tc) => tc !== undefined) || [],
          done: chunk.choices[0].finish_reason !== null,
          additionalInfo: {
            finishReason: chunk.choices[0].finish_reason,
          },
        };
      }
    }
  }

  async generateObject<T>(input: GenerateObjectInput): Promise<T> {
    const response = await this.openAIClient.chat.completions.create({
      messages: this.convertToOpenAIMessages(input.messages),
      model: this.config.model,
      temperature: input.options?.temperature ?? 1.0,
      max_completion_tokens: input.options?.maxTokens,
      stop: input.options?.stopSequences,
      response_format: { type: 'json_object' },
    });

    if (response.choices && response.choices.length > 0) {
      try {
        const rawContent = response.choices[0].message.content!;

        // Strategy 1: try repairJson with extractJson (handles trailing garbage)
        try {
          const repairedRaw = repairJson(rawContent, { extractJson: true }) as string;
          // repairJson can return a string that still fails to parse
          let repaired: unknown;
          try {
            repaired = JSON.parse(repairedRaw);
          } catch {
            // repairJson didn't actually fix it — fall through to strategy 2
            throw new Error('repairJson output is not valid JSON');
          }
          // If it's a bare array wrapping an object, unwrap it
          if (Array.isArray(repaired) && repaired.length === 1 && typeof repaired[0] === 'object') {
            return input.schema.parse(repaired[0]) as T;
          }
          // If repairJson returned something that parsed but isn't an object,
          // fall through to strategy 3 to try extracting a JSON object
          if (typeof repaired !== 'object' || repaired === null) {
            throw new Error('repairJson did not return a JSON object');
          }
          return input.schema.parse(repaired) as T;
        } catch (e1) {
          // Strategy 2: model sometimes returns "[{...}]" — try to extract the object from the array
          const arrayMatch = rawContent.match(/^\s*\[\s*(\{[\s\S]*\})\s*\]\s*$/);
          if (arrayMatch) {
            try {
              const parsed = JSON.parse(arrayMatch[1]);
              return input.schema.parse(parsed) as T;
            } catch {
              // fall through
            }
          }

          // Strategy 3: try extracting first {...} from the raw text
          const objMatch = rawContent.match(/\{[\s\S]*\}/);
          if (objMatch) {
            try {
              const parsed = JSON.parse(objMatch[0]);
              return input.schema.parse(parsed) as T;
            } catch {
              // fall through
            }
          }

          // Last resort: if rawContent has no JSON at all, the model returned plain text.
          // Return null as a sentinel — callers that can't handle null will throw.
          console.warn(
            `[generateObject] Could not parse JSON from LLM response. ` +
            `Returning null. Raw content preview: ${rawContent.slice(0, 100)}`,
          );
          return null as unknown as T;
        }
      } catch (err) {
        throw new Error(`Error parsing response from LlamaServer: ${err}`);
      }
    }

    throw new Error('No response from LlamaServer');
  }

  async *streamObject<T>(
    input: GenerateObjectInput,
  ): AsyncGenerator<Partial<T>> {
    let recievedObj: string = '';

    const stream = await this.openAIClient.chat.completions.create({
      messages: this.convertToOpenAIMessages(input.messages),
      model: this.config.model,
      temperature: input.options?.temperature ?? 1.0,
      max_completion_tokens: input.options?.maxTokens,
      stop: input.options?.stopSequences,
      response_format: { type: 'json_object' },
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices.length > 0) {
        const delta = chunk.choices[0].delta.content || '';
        if (delta) {
          recievedObj += delta;
          try {
            yield parse(recievedObj) as Partial<T>;
          } catch {
            // partial JSON not ready yet
          }
        }
        if (chunk.choices[0].finish_reason !== null) {
          try {
            yield JSON.parse(recievedObj) as T;
          } catch (err) {
            throw new Error(`Error parsing response from LlamaServer: ${err}`);
          }
        }
      }
    }
  }
}

export default LlamaServerLLM;
