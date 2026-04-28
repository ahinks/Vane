import { UIConfigField } from '@/lib/config/types';
import { getConfiguredModelProviderById } from '@/lib/config/serverRegistry';
import BaseModelProvider from '../../base/provider';
import { Model, ModelList, ProviderMetadata } from '../../types';
import BaseLLM from '../../base/llm';
import BaseEmbedding from '../../base/embedding';
import LlamaServerLLM from './llamaserverLLM';

interface LlamaServerConfig {
  baseURL: string;
  apiKey?: string;
}

const providerConfigFields: UIConfigField[] = [
  {
    type: 'string',
    name: 'Base URL',
    key: 'baseURL',
    description: 'The base URL for the LlamaServer instance',
    required: true,
    placeholder: 'http://localhost:8081/v1',
    env: 'LLAMASERVER_BASE_URL',
    scope: 'server',
  },
  {
    type: 'password',
    name: 'API Key',
    key: 'apiKey',
    description: 'Optional API key for authentication',
    required: false,
    placeholder: 'Optional',
    env: 'LLAMASERVER_API_KEY',
    scope: 'server',
  },
];

class LlamaServerProvider extends BaseModelProvider<LlamaServerConfig> {
  constructor(id: string, name: string, config: LlamaServerConfig) {
    super(id, name, config);
  }

  async getDefaultModels(): Promise<ModelList> {
    try {
      const headers: Record<string, string> = {
        'Content-type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const res = await fetch(`${this.config.baseURL}/models`, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      const models: Model[] = (data.data || []).map((m: any) => {
        return {
          name: m.id || m.name,
          key: m.id || m.name,
        };
      });

      return {
        embedding: [],
        chat: models,
      };
    } catch (err) {
      throw new Error(
        `Error connecting to LlamaServer at ${this.config.baseURL}. Please ensure the server is running.`,
      );
    }
  }

  async getModelList(): Promise<ModelList> {
    const defaultModels = await this.getDefaultModels();
    const configProvider = getConfiguredModelProviderById(this.id)!;

    return {
      embedding: [...configProvider.embeddingModels],
      chat: [...defaultModels.chat, ...configProvider.chatModels],
    };
  }

  async loadChatModel(key: string): Promise<BaseLLM<any>> {
    const modelList = await this.getModelList();

    const exists = modelList.chat.find((m) => m.key === key);

    if (!exists) {
      throw new Error(
        'Error Loading LlamaServer Chat Model. Invalid Model Selected',
      );
    }

    return new LlamaServerLLM({
      baseURL: this.config.baseURL,
      apiKey: this.config.apiKey,
      model: key,
    });
  }

  async loadEmbeddingModel(_key: string): Promise<BaseEmbedding<any>> {
    throw new Error('Embedding models are not supported by LlamaServer');
  }

  static parseAndValidate(raw: any): LlamaServerConfig {
    if (!raw || typeof raw !== 'object')
      throw new Error('Invalid config provided. Expected object');
    if (!raw.baseURL)
      throw new Error('Invalid config provided. Base URL must be provided');

    return {
      baseURL: raw.baseURL
        ? String(raw.baseURL).replace(/\/$/, '')
        : 'http://localhost:8081',
      apiKey: raw.apiKey ? String(raw.apiKey) : undefined,
    };
  }

  static getProviderConfigFields(): UIConfigField[] {
    return providerConfigFields;
  }

  static getProviderMetadata(): ProviderMetadata {
    return {
      key: 'llamaserver',
      name: 'LlamaServer',
    };
  }
}

export default LlamaServerProvider;
