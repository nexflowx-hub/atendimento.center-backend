import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
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


export class ListSmmServicesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  providerCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 100;
}

export class UpsertSmmOfferDto {
  @IsUUID()
  serviceId!: string;

  @IsString()
  @MaxLength(180)
  publicName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  salePrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string = 'BRL';

  @IsOptional()
  @IsIn(['fixed', 'per_unit_size'])
  pricingModel?: 'fixed' | 'per_unit_size' = 'per_unit_size';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unitSize?: number = 1000;

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number = 100;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
