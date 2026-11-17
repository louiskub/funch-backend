import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CarOptionCategory } from '../enums/car-option-category.enum';
import { CarOptionPricingType } from '../enums/car-option-pricing-type.enum';

export class BranchOptionParams {
  @IsUUID()
  branchId!: string;
}

export class OptionIdParams {
  @IsUUID()
  optionId!: string;
}

export class OptionTimelineQueryDto {
  @IsUUID()
  branchId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

export class OptionTimelineDetailQueryDto {
  @IsUUID()
  optionId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  date!: string;
}

export class CreateOptionDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsEnum(CarOptionCategory)
  category!: CarOptionCategory;

  @IsEnum(CarOptionPricingType)
  pricingType!: CarOptionPricingType;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/)
  price!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityStock!: number | null;
}

export class UpdateOptionDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^[A-Za-z0-9_-]+$/)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsOptional()
  @IsEnum(CarOptionCategory)
  category?: CarOptionCategory;

  @IsOptional()
  @IsEnum(CarOptionPricingType)
  pricingType?: CarOptionPricingType;

  @IsOptional()
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/)
  price?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantityStock?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
