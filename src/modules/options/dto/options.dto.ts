import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const categories = ['EQUIPMENT', 'SERVICE', 'PROTECTION'] as const;
const pricingTypes = ['PER_DAY', 'PER_UNIT_PER_DAY', 'FIXED'] as const;

export class BranchOptionParams {
  @IsUUID()
  branchId!: string;
}

export class OptionIdParams {
  @IsUUID()
  optionId!: string;
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

  @IsIn(categories)
  category!: (typeof categories)[number];

  @IsIn(pricingTypes)
  pricingType!: (typeof pricingTypes)[number];

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
  @IsIn(categories)
  category?: (typeof categories)[number];

  @IsOptional()
  @IsIn(pricingTypes)
  pricingType?: (typeof pricingTypes)[number];

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
