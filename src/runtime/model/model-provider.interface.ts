import type {
  ModelCapability,
  ProviderModelRequest,
  ProviderModelResponse,
} from './model.types';

export interface ModelProvider {
  readonly id: string;

  generate(request: ProviderModelRequest): Promise<ProviderModelResponse>;

  supports(capability: ModelCapability): boolean;
}

export const MODEL_PROVIDERS = Symbol('MODEL_PROVIDERS');
