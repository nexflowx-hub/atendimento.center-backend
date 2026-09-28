import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
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
