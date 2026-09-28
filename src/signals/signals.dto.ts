import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListSignalsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  network?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class CreateSignalJobDto {
  @IsOptional()
  @IsUUID()
  connectorId?: string;

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsString()
  @MaxLength(80)
  taskType!: string;

  @IsString()
  @MaxLength(2000)
  target!: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;
}


export class ConfigureSignalConnectorDto {
  @IsOptional()
  @IsIn(['pending_configuration', 'active', 'disabled'])
  status?: 'pending_configuration' | 'active' | 'disabled';

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
