import { Controller, Get, Param } from '@nestjs/common';
import { PortalService } from './portal.service';

@Controller('portal')
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.portalService.getByToken(token);
  }
}
