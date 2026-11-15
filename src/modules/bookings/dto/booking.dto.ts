import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BookingOptionInput {
  @IsUUID() carOptionId!: string;
  @IsInt() @Min(1) @Max(99) quantity!: number;
}

export class QuoteInput {
  @IsUUID() offerId!: string;
  @IsString() pickupAt!: string;
  @IsString() returnAt!: string;
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BookingOptionInput)
  options!: BookingOptionInput[];
}

export class CheckoutInput extends QuoteInput {
  @IsUUID() checkoutKey!: string;
  @IsOptional() @IsString() @Length(1, 120) customerName?: string;
  @IsOptional() @IsEmail() @MaxLength(254) customerEmail?: string;
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  customerPassword?: string;
  @IsOptional() @IsString() @Length(3, 40) customerPhone?: string;
}

export class ReasonInput {
  @IsString() @Length(1, 500) reason!: string;
}

export class PickupInput {
  @IsUUID() carId!: string;
}

export class AddChargeInput {
  @IsString() type!: 'FUEL' | 'DAMAGE' | 'OTHER';
  @IsString() @Length(1, 500) description!: string;
  @IsString() amount!: string;
}

export class ReturnInput {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AddChargeInput)
  charges?: AddChargeInput[];
}

export class ReportFilterInput {
  @IsString() createdFrom!: string;
  @IsString() createdTo!: string;
  @IsOptional() @IsString() countryCode?: string;
  @IsOptional() @IsUUID() branchId?: string;
}

export class MemberSearchInput {
  @IsOptional() @IsString() @MaxLength(254) query?: string;
}

export class SuspensionInput {
  @IsBoolean() isSuspended!: boolean;
}
