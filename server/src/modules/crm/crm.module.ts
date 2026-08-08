import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Deal } from './entities/deal.entity';
import { DealInteraction } from './entities/deal-interaction.entity';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Deal, DealInteraction])],
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
