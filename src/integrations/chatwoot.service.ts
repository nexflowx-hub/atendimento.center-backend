import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface ConversationQuery {
  status?: string;
  assigneeType?: string;
  q?: string;
  page?: number;
}

@Injectable()
export class ChatwootService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return (this.config.get<string>('CHATWOOT_BASE_URL') ?? 'http://chatwoot:3000').replace(/\/$/, '');
  }

  private get headers(): Record<string, string> {
    const token = this.config.get<string>('CHATWOOT_API_TOKEN');
    if (!token) {
      throw new ServiceUnavailableException('Token da API Chatwoot não configurado.');
    }

    return {
      api_access_token: token,
      Accept: 'application/json',
    };
  }

  async health(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(`${this.baseUrl}/api`));
      return true;
    } catch {
      return false;
    }
  }

  async listConversations(accountId: number, query: ConversationQuery = {}): Promise<unknown> {
    return this.execute(async () => {
      const response = await firstValueFrom(
        this.http.get(`${this.baseUrl}/api/v1/accounts/${accountId}/conversations`, {
          headers: this.headers,
          params: {
            status: query.status ?? 'open',
            assignee_type: query.assigneeType ?? 'all',
            q: query.q || undefined,
            page: query.page ?? 1,
          },
        }),
      );
      return response.data;
    });
  }

  async getConversation(accountId: number, conversationId: number): Promise<unknown> {
    return this.execute(async () => {
      const response = await firstValueFrom(
        this.http.get(
          `${this.baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}`,
          { headers: this.headers },
        ),
      );
      return response.data;
    });
  }

  async sendMessage(accountId: number, conversationId: number, content: string): Promise<unknown> {
    return this.execute(async () => {
      const response = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
          {
            content: content.trim(),
            message_type: 'outgoing',
            private: false,
            content_type: 'text',
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    });
  }

  async toggleStatus(
    accountId: number,
    conversationId: number,
    status: 'open' | 'resolved' | 'pending' | 'snoozed',
    snoozedUntil?: number,
  ): Promise<unknown> {
    return this.execute(async () => {
      const response = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
          {
            status,
            snoozed_until: status === 'snoozed' ? snoozedUntil : undefined,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new BadGatewayException(`Falha na comunicação com o Chatwoot: ${message}`);
    }
  }
}
