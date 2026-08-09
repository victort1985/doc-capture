import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceListItem } from './entities/price-list-item.entity';
import { PriceTier } from './entities/price-tier.entity';
import { PriceTierOverride } from './entities/price-tier-override.entity';
import { PriceListService } from './price-list.service';
import { PriceTierService } from './price-tier.service';
import { PriceListController } from './price-list.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PriceListItem, PriceTier, PriceTierOverride])],
  controllers: [PriceListController],
  providers: [PriceListService, PriceTierService],
  exports: [PriceListService, PriceTierService, TypeOrmModule],
})
export class PriceListModule {}
