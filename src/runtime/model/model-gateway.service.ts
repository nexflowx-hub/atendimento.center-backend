import { Injectable } from '@nestjs/common';
import type { ModelProvider } from './model-provider.interface';
import type {
  ModelCapability,
  ModelRequest,
  ModelResponse,
} from './model.types';
import { OpenRouterProvider } from './providers/openrouter.provider';

@Injectable()
export class ModelGateway {
  private readonly providers: Map<string, ModelProvider>;

  constructor(openRouter: OpenRouterProvider) {
    this.providers = new Map([[openRouter.id, openRouter]]);
  }

  generate(request: ModelRequest): Promise<ModelResponse> {
    const providerId = request.provider ?? 'openrouter';
    const provider = this.providers.get(providerId);

    if (!provider) {
      throw new Error(`Unsupported model provider: ${providerId}`);
    }

    const { provider: _provider, ...providerRequest } = request;
    return provider.generate(providerRequest);
  }

  supports(
    providerId: string,
    capability: ModelCapability,
  ): boolean {
    return this.providers.get(providerId)?.supports(capability) ?? false;
  }
}
