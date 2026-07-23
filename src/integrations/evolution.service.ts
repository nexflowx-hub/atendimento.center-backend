import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class EvolutionService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>('EVOLUTION_BASE_URL') ?? 'http://evolution:8080';
  }

  private get headers(): Record<string, string> {
    const apiKey = this.config.get<string>('EVOLUTION_API_KEY');
    return apiKey ? { apikey: apiKey } : {};
  }

  async health(): Promise<boolean> {
    try {
      await firstValueFrom(this.http.get(`${this.baseUrl}/`, { headers: this.headers }));
      return true;
    } catch {
      return false;
    }
  }

  async connectionState(instance: string): Promise<unknown> {
    const response = await firstValueFrom(
      this.http.get(`${this.baseUrl}/instance/connectionState/${instance}`, {
        headers: this.headers,
      }),
    );
    return response.data;
  }
}
