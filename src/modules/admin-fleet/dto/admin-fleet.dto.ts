import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
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

const decimal = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;

export class IdParams {
  @IsUUID()
  id!: string;
}

export class CarTypeDto {
  @IsString() @MinLength(1) @MaxLength(80) brand!: string;
  @IsString() @MinLength(1) @MaxLength(100) model!: string;
  @IsInt() @Min(1) @Max(100) seats!: number;
  @IsIn(['AUTO', 'MANUAL']) transmission!: string;
  @IsIn(['GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID']) fuelType!: string;
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
  @IsIn(['AUTO', 'MANUAL'])
  transmission?: string;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsIn(['GASOLINE', 'DIESEL', 'ELECTRIC', 'HYBRID'])
  fuelType?: string;
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
  @IsIn(['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED']) status!: string;
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
  @IsIn(['ACTIVE', 'MAINTENANCE', 'DECOMMISSIONED'])
  status?: string;
}
