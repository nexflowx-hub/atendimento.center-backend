import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseUser } from './auth.types';

@Injectable()
export class SupabaseAuthService {
  constructor(private readonly config: ConfigService) {}

  async verifyAccessToken(accessToken: string): Promise<SupabaseUser> {
    const supabaseUrl = this.config.get<string>('SUPABASE_URL');
    const supabaseAnonKey = this.config.get<string>('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new ServiceUnavailableException('Supabase Auth não está configurado.');
    }

    let response: Response;
    try {
      response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
          Accept: 'application/json',
        },
      });
    } catch {
      throw new ServiceUnavailableException('Não foi possível contactar o Supabase Auth.');
    }

    if (!response.ok) {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }

    const user = (await response.json()) as SupabaseUser;
    if (!user.id) {
      throw new UnauthorizedException('Utilizador Supabase inválido.');
    }

    return user;
  }
}
