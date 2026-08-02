import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OpenFormatExportService } from './open-format-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

@Controller('tax-authority-export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TaxAuthorityExportController {
  constructor(private readonly service: OpenFormatExportService) {}

  /** Generates and streams the export as a single downloadable zip
   * (OPENFRMT/{vatid}.{yy}/{MMDDhhmm}/ containing TXT.INI + BKMVDATA)
   * for the given date range. Super-admin accounts (organizationId
   * === null) can't run this — there's no single organization's
   * business data to export for one, same reasoning as every other
   * org-scoped-only feature in this app. */
  @Post()
  async generate(@Body() body: { from: string; to: string }, @CurrentUser() user: ReqUser, @Res() res: Response) {
    if (user.organizationId == null) {
      res.status(400).json({ message: 'Sign in as a user assigned to a specific organization to generate this export.' });
      return;
    }
    const { outerZipBuffer, outputPath } = await this.service.generate({
      organizationId: user.organizationId,
      from: new Date(body.from),
      to: new Date(body.to),
    });
    const fileName = outputPath.replace(/\//g, '_') + '.zip';
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    res.send(outerZipBuffer);
  }
}
