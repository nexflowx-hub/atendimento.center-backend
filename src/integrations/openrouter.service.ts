import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

@Injectable()
export class OpenRouterService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async complete(messages: AiMessage[]): Promise<string> {
    const apiKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const response = await firstValueFrom(
      this.http.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: this.config.get<string>('OPENROUTER_MODEL') ?? 'openai/gpt-4.1-mini',
          messages,
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://atendimento.center',
            'X-Title': 'Atendimento.Center',
          },
        },
      ),
    );

    return response.data?.choices?.[0]?.message?.content ?? '';
  }
}
