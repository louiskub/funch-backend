import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CarTransmission } from '../enums/car-transmission.enum';
import { CarFuelType } from '../enums/car-fuel-type.enum';
import { CarStatus } from '../enums/car-status.enum';

const decimal = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;

export class IdParams {
  @IsUUID()
  id!: string;
}

export class CarTypeDto {
  @IsString() @MinLength(1) @MaxLength(80) brand!: string;
  @IsString() @MinLength(1) @MaxLength(100) model!: string;
  @IsInt() @Min(1) @Max(100) seats!: number;
  @IsEnum(CarTransmission) transmission!: CarTransmission;
  @IsEnum(CarFuelType) fuelType!: CarFuelType;
  @IsArray() @IsString({ each: true }) features!: string[];
}

export class UpdateCarTypeDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  model?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100)
  seats?: number;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(CarTransmission)
  transmission?: CarTransmission;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(CarFuelType)
  fuelType?: CarFuelType;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  features?: string[];
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class OfferDto {
  @IsUUID() carTypeId!: string;
  @IsUUID() branchId!: string;
  @IsString() @Matches(decimal) baseDailyRate!: string;
  @IsString() @Matches(decimal) baseHourlyRate!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currencyCode!: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @IsUUID('4', { each: true })
  supportedOptionIds?: string[];
}

export class UpdateOfferDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(decimal)
  baseDailyRate?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(decimal)
  baseHourlyRate?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsArray()
  @IsUUID('4', { each: true })
  supportedOptionIds?: string[];
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

export class CarDto {
  @IsUUID() carTypeBranchId!: string;
  @IsString() @MinLength(1) @MaxLength(100) vin!: string;
  @IsString() @MinLength(1) @MaxLength(40) licensePlate!: string;
  @IsInt() @Min(1886) @Max(new Date().getUTCFullYear() + 1) year!: number;
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  buyDate?: string | null;
  @IsEnum(CarStatus) status!: CarStatus;
}

export class UpdateCarDto {
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsUUID()
  carTypeBranchId?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  vin?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  licensePlate?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1886)
  @Max(new Date().getUTCFullYear() + 1)
  year?: number;
  @ValidateIf((_, value: unknown) => value !== undefined && value !== null)
  @IsDateString()
  buyDate?: string | null;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsEnum(CarStatus)
  status?: CarStatus;
}
