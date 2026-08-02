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
   * organizationId is never read from the request body — it comes
   * from user.organizationId, which JwtStrategy.validate() already
   * resolves correctly for both an org-scoped admin (their own real
   * org, always) and a super-admin (null, unless they're currently
   * "acting as" an organization via the global org-switcher in the
   * admin panel's header — see JwtStrategy's own doc comment for the
   * X-Active-Org mechanism this relies on). This controller doesn't
   * need to know that mechanism exists at all. */
  @Post()
  async generate(@Body() body: { from: string; to: string }, @CurrentUser() user: ReqUser, @Res() res: Response) {
    if (user.organizationId == null) {
      res.status(400).json({ message: 'Pick which organization to generate this export for (use the organization switcher in the header).' });
      return;
    }
    const { outerZipBuffer, outputPath, bkmvdataSizeBytes, exceedsSimulatorLimit } = await this.service.generate({
      organizationId: user.organizationId,
      from: new Date(body.from),
      to: new Date(body.to),
    });
    const fileName = outputPath.replace(/\//g, '_') + '.zip';
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      // The Tax Authority's own simulator caps BKMVDATA.TXT at 4MB
      // (see packaging.service.ts's own doc comment) — surfaced here
      // so the admin panel can warn before the person even tries
      // uploading a file that's guaranteed to be rejected, rather
      // than them finding out only after visiting the simulator.
      'X-Bkmvdata-Size-Bytes': String(bkmvdataSizeBytes),
      'X-Exceeds-Simulator-Limit': String(exceedsSimulatorLimit),
    });
    res.send(outerZipBuffer);
  }
}
