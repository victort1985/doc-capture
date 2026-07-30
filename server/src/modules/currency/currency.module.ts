import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { ExchangeRateService } from './exchange-rate.service';
import { CurrencyController } from './currency.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExchangeRate])],
  controllers: [CurrencyController],
  providers: [ExchangeRateService],
  exports: [ExchangeRateService],
})
export class CurrencyModule {}
