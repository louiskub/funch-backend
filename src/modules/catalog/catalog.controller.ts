import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import {
  BranchIdParams,
  CountryCodeParams,
  OfferIdParams,
} from './dto/catalog.dto';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('countries')
  countries() {
    return this.catalog.countries();
  }

  @Get('countries/:countryCode/branches')
  branches(@Param() { countryCode }: CountryCodeParams) {
    return this.catalog.branches(countryCode);
  }

  @Get('branches/:branchId/offers')
  offers(@Param() { branchId }: BranchIdParams) {
    return this.catalog.offers(branchId);
  }

  @Get('offers/:offerId')
  async offer(@Param() { offerId }: OfferIdParams) {
    const offer = await this.catalog.offer(offerId);
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }
}
