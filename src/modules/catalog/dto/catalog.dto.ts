import { IsString, Length, Matches, IsUUID } from 'class-validator';

export class CountryCodeParams {
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;
}

export class BranchIdParams {
  @IsUUID()
  branchId!: string;
}

export class OfferIdParams {
  @IsUUID()
  offerId!: string;
}
