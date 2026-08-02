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
   * for the given date range and organization.
   *
   * Org-scoped admins are always forced to their own organization —
   * body.organizationId is ignored for them entirely, not just
   * validated, so there's no way to pass a different org's id and
   * export data that isn't theirs. Only a genuine super-admin
   * (organizationId === null on their own session) can choose which
   * organization to export via body.organizationId, since a
   * super-admin manages more than one and there's no single
   * "their own org" to default to. */
  @Post()
  async generate(
    @Body() body: { from: string; to: string; organizationId?: number },
    @CurrentUser() user: ReqUser,
    @Res() res: Response,
  ) {
    const isSuperAdmin = user.organizationId == null;
    const targetOrgId = isSuperAdmin ? body.organizationId : user.organizationId;
    if (targetOrgId == null) {
      res.status(400).json({ message: 'Pick which organization to generate this export for.' });
      return;
    }
    const { outerZipBuffer, outputPath } = await this.service.generate({
      organizationId: targetOrgId,
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
