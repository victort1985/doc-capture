import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateLocationDto } from './dto/create-location.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { organizationId: number | null };

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // --- Regions (shared geography reference data, not org-scoped) ---

  @Get('regions')
  findAllRegions() {
    return this.locationsService.findAllRegions();
  }

  @Post('regions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createRegion(@Body() dto: CreateRegionDto) {
    return this.locationsService.createRegion(dto);
  }

  @Delete('regions/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteRegion(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.deleteRegion(id);
  }

  // --- Cities (shared geography reference data, not org-scoped) ---

  /** Search-as-you-type: ?q=<prefix>&regionId=<id> */
  @Get('cities')
  findCities(@Query('q') q?: string, @Query('regionId') regionId?: string) {
    return this.locationsService.findCities(q, regionId ? parseInt(regionId, 10) : undefined);
  }

  @Post('cities')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createCity(@Body() dto: CreateCityDto) {
    return this.locationsService.createCity(dto);
  }

  @Delete('cities/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteCity(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.deleteCity(id);
  }

  // --- Locations ("place" / "organization" business field) — org-scoped ---

  /** Search-as-you-type: ?q=<prefix>&cityId=<id>&mainOnly=true. Scoped to the requester's organization unless they're the super-admin. */
  @Get()
  findLocations(@CurrentUser() user: RequestUser, @Query('q') q?: string, @Query('cityId') cityId?: string, @Query('mainOnly') mainOnly?: string) {
    return this.locationsService.findLocations(q, cityId ? parseInt(cityId, 10) : undefined, user.organizationId, mainOnly === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.locationsService.findLocationById(id, user.organizationId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  createLocation(@Body() dto: CreateLocationDto, @CurrentUser() user: RequestUser) {
    return this.locationsService.createLocation(dto, user.organizationId);
  }

  /** Marks/unmarks this location as one of the company's main warehouses. */
  @Patch(':id/main-warehouse')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  setMainWarehouse(@Param('id', ParseIntPipe) id: number, @Body() body: { isMainWarehouse: boolean }) {
    return this.locationsService.setMainWarehouse(id, !!body.isMainWarehouse);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteLocation(@Param('id', ParseIntPipe) id: number) {
    return this.locationsService.deleteLocation(id);
  }
}
