import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteSettings } from './entities/quote-settings.entity';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { QuoteSettingsController } from './quote-settings.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Quote, QuoteSettings]), UsersModule],
  controllers: [QuotesController, QuoteSettingsController],
  providers: [QuotesService],
})
export class QuotesModule {}
