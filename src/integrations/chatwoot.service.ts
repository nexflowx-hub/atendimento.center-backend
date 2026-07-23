import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ChatwootService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('CHATWOOT_BASE_URL') ?? 'http://chatwoot:3000';
  }

  private get headers(): Record<string, string> {
    const token = this.config.get<string>('CHATWOOT_API_TOKEN');
    return token ? { api_access_token: token } : {};
  }

  async health(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(`${this.baseUrl}/api`));
      return true;
    } catch {
      return false;
    }
  }

  async listConversations(accountId: number): Promise<unknown> {
    const response = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/accounts/${accountId}/conversations`, {
        headers: this.headers,
      }),
    );
    return response.data;
  }

  async sendMessage(accountId: number, conversationId: number, content: string): Promise<unknown> {
    const response = await firstValueFrom(
      this.http.post(
        `${this.baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        { content, message_type: 'outgoing', private: false },
        { headers: this.headers },
      ),
    );
    return response.data;
  }
}
