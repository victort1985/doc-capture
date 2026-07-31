import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { RentalsService } from './rentals.service';
import { CreateRentalDto } from './dto/create-rental.dto';
import { RentalStatus } from './entities/rental.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('rentals')
@UseGuards(JwtAuthGuard)
export class RentalsController {
  constructor(private readonly service: RentalsService) {}

  @Get()
  list(@CurrentUser() user: ReqUser, @Query('status') status?: RentalStatus) {
    return this.service.list(user.organizationId, status);
  }

  @Get('active')
  listActive(@CurrentUser() user: ReqUser) {
    return this.service.listActive(user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateRentalDto, @CurrentUser() user: ReqUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }

  @Post(':id/return')
  markReturned(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.service.markReturned(id, user.organizationId, user.id);
  }
}
