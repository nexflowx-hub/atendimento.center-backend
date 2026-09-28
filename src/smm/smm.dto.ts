import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListSmmQuery {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class CreateSmmOrderDto {
  @IsUUID()
  offerId!: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsString()
  @MaxLength(2000)
  target!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  paymentReference?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}


export class ConfigureSmmProviderDto {
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  baseUrl!: string;

  @IsOptional()
  @IsIn(['pending_configuration', 'active', 'disabled'])
  status?: 'pending_configuration' | 'active' | 'disabled';
}
