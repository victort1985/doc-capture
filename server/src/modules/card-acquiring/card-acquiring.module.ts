import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardAcquiringSettings } from './entities/card-acquiring-settings.entity';
import { CardAcquiringService } from './card-acquiring.service';
import { CardAcquiringController } from './card-acquiring.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CardAcquiringSettings])],
  controllers: [CardAcquiringController],
  providers: [CardAcquiringService],
})
export class CardAcquiringModule {}
