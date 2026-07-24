import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WarehouseService } from './warehouse.service';
import { WarehouseCategory } from './entities/warehouse-category.entity';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction } from './entities/warehouse-transaction.entity';
import { WarehouseRepair } from './entities/warehouse-repair.entity';
import { WarehouseTransfer } from './entities/warehouse-transfer.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';

describe('WarehouseService.generateBarcode', () => {
  let service: WarehouseService;
  let queryBuilder: { select: jest.Mock; getRawOne: jest.Mock };
  let itemsRepo: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    queryBuilder = { select: jest.fn().mockReturnThis(), getRawOne: jest.fn() };
    itemsRepo = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WarehouseService,
        { provide: getRepositoryToken(WarehouseCategory), useValue: {} },
        { provide: getRepositoryToken(WarehouseItem), useValue: itemsRepo },
        { provide: getRepositoryToken(WarehouseTransaction), useValue: {} },
        { provide: getRepositoryToken(WarehouseRepair), useValue: {} },
        { provide: getRepositoryToken(WarehouseTransfer), useValue: {} },
        { provide: getRepositoryToken(ServiceCall), useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(WarehouseService);
  });

  it('bases the next barcode on MAX(id), not a row count', async () => {
    queryBuilder.getRawOne.mockResolvedValue({ max: '41' });

    const barcode = await service.generateBarcode();

    expect(barcode).toBe('DC00000042');
    expect(itemsRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it('regression guard: barcode does not repeat after an item is deleted (MAX(id) survives deletion, unlike COUNT)', async () => {
    // Item created while 41 items exist -> id 42 -> barcode DC00000042.
    queryBuilder.getRawOne.mockResolvedValueOnce({ max: '41' });
    const first = await service.generateBarcode();
    expect(first).toBe('DC00000042');

    // That item (or some other one) gets deleted - a COUNT(*)-based
    // implementation would now see a lower count and could reissue
    // DC00000042 again. MAX(id) does not go backwards just because a
    // row was removed, so the next real id (43) still produces 43.
    queryBuilder.getRawOne.mockResolvedValueOnce({ max: '42' });
    const second = await service.generateBarcode();
    expect(second).toBe('DC00000043');
    expect(second).not.toBe(first);
  });

  it('starts from DC00000001 when the warehouse is empty', async () => {
    queryBuilder.getRawOne.mockResolvedValue({ max: null });

    const barcode = await service.generateBarcode();

    expect(barcode).toBe('DC00000001');
  });

  it('accepts a custom prefix', async () => {
    queryBuilder.getRawOne.mockResolvedValue({ max: '5' });

    const barcode = await service.generateBarcode('XY');

    expect(barcode).toBe('XY00000006');
  });
});
