import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { PhoneBookService } from './phonebook.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ContactCategory } from './entities/phonebook-contact.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

const MAX_FILE_SIZE = 15 * 1024 * 1024;

type RequestUser = { id: number; organizationId: number | null };

@Controller('phonebook')
@UseGuards(JwtAuthGuard)
export class PhoneBookController {
  constructor(private readonly phoneBookService: PhoneBookService) {}

  // Reading the phone book is available to any authenticated user (spec
  // item 4: anyone opening a call can pick a contact), but always scoped
  // to their own organization (spec: multi-tenancy) unless they're the
  // super-admin; only writes are additionally admin-restricted (spec
  // item 5).

  /** GET /phonebook/search?q=...&type=supplier|client — quick search, max 10 results */
  @Get('search')
  search(
    @CurrentUser() user: RequestUser,
    @Query('q') q: string,
    @Query('type') type?: string,
  ) {
    const category = type === 'supplier' ? ContactCategory.SUPPLIER
      : type === 'client' ? ContactCategory.CLIENT
      : undefined;
    return this.phoneBookService.findAll({ q, category, tenantId: user.organizationId });
  }

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('category') category?: ContactCategory,
    @Query('q') q?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.phoneBookService.findAll({
      category,
      q,
      organizationId: organizationId ? parseInt(organizationId, 10) : undefined,
      tenantId: user.organizationId,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.phoneBookService.findOne(id, user.organizationId);
  }

  @Get(':id/photo')
  async downloadPhoto(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser, @Res() res: Response) {
    const file = await this.phoneBookService.downloadPhoto(id, user.organizationId);
    res.set({ 'Content-Type': file.mimetype });
    res.send(file.buffer);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_FILE_SIZE } }))
  create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() photo?: { buffer: Buffer; mimetype: string },
  ) {
    return this.phoneBookService.create(user.id, user.organizationId, dto, photo);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_FILE_SIZE } }))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: RequestUser,
    @UploadedFile() photo?: { buffer: Buffer; mimetype: string },
  ) {
    return this.phoneBookService.update(id, user.organizationId, dto, user.id, photo);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.phoneBookService.remove(id, user.organizationId);
  }
}
