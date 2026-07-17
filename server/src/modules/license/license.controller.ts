import { Body, Controller, Get, Post } from '@nestjs/common';
import { LicenseService } from './license.service';

@Controller('license')
export class LicenseController {
  constructor(private readonly licenseService: LicenseService) {}

  /** No auth guard — needs to be checkable before login exists, and
   * while fully locked out, so the app can show *why*. */
  @Get('status')
  getStatus() {
    return this.licenseService.getStatus();
  }

  @Post('activate')
  activate(@Body() body: { key: string }) {
    return this.licenseService.activate(body.key);
  }
}
