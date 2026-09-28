import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListCrmQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class CreateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  telegramUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  locale?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateLeadDto {
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  productCode?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  stage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsUUID()
  ownerAuthUserId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
