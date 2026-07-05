import { Body, Controller, Get, Param, ParseEnumPipe, Put, UseGuards } from '@nestjs/common';
import { DocumentStorageSettingsService } from './document-storage-settings.service';
import { DocumentCategory, TEMPLATE_VARIABLES } from './entities/document-type-settings.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { organizationId: number | null };

@Controller('document-storage-settings')
@UseGuards(JwtAuthGuard)
export class DocumentStorageSettingsController {
  constructor(private readonly service: DocumentStorageSettingsService) {}

  /** The five document categories + which template variables they can use. */
  @Get('template-variables')
  getTemplateVariables() {
    return TEMPLATE_VARIABLES;
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.service.findAll(user.organizationId);
  }

  @Put(':documentType')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  upsert(
    @Param('documentType', new ParseEnumPipe(DocumentCategory)) documentType: DocumentCategory,
    @Body() body: { storageConnectionId?: number | null; pathPattern?: string; filenameTemplate?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.upsert(documentType, user.organizationId, body);
  }
}
