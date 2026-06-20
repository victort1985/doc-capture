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
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
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

@Controller('phonebook')
@UseGuards(JwtAuthGuard)
export class PhoneBookController {
  constructor(private readonly phoneBookService: PhoneBookService) {}

  // Reading the phone book is available to any authenticated user (spec
  // item 4: anyone opening a call can pick a contact); only writes are
  // admin-restricted (spec item 5).

  @Get()
  findAll(
    @Query('category') category?: ContactCategory,
    @Query('q') q?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.phoneBookService.findAll({
      category,
      q,
      organizationId: organizationId ? parseInt(organizationId, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.phoneBookService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_FILE_SIZE } }))
  create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: { id: number },
    @UploadedFile() photo?: { buffer: Buffer; mimetype: string },
  ) {
    return this.phoneBookService.create(user.id, dto, photo);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_FILE_SIZE } }))
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: { id: number },
    @UploadedFile() photo?: { buffer: Buffer; mimetype: string },
  ) {
    return this.phoneBookService.update(id, dto, user.id, photo);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.phoneBookService.remove(id);
  }
}
