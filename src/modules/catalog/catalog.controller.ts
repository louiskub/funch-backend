import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
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
  offers(
    @Param() { branchId }: BranchIdParams,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    return this.catalog.offers(branchId, { page, pageSize, category, sortBy });
  }

  @Get('offers/:offerId')
  async offer(@Param() { offerId }: OfferIdParams) {
    const offer = await this.catalog.offer(offerId);
    if (!offer) throw new NotFoundException('Offer not found');
    return offer;
  }
}
