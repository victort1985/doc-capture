import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { Order } from './entities/order.entity';
import { StorageService } from '../storage/storage.service';
import { OrderPdfParserService } from './order-pdf-parser.service';
import { OrderNotificationService } from './order-notification.service';
import { DocumentStorageSettingsService } from '../document-storage-settings/document-storage-settings.service';
import { DocumentCategory } from '../document-storage-settings/entities/document-type-settings.entity';

describe('OrdersService.resolveConnectionId (private, tested via bracket access)', () => {
  const ORIGINAL_ENV = process.env.ORDERS_STORAGE_CONNECTION_ID;
  let service: OrdersService;
  let storageSettingsService: { findOne: jest.Mock };

  beforeEach(async () => {
    storageSettingsService = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: OrderPdfParserService, useValue: {} },
        { provide: OrderNotificationService, useValue: {} },
        { provide: DocumentStorageSettingsService, useValue: storageSettingsService },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  afterEach(() => {
    process.env.ORDERS_STORAGE_CONNECTION_ID = ORIGINAL_ENV;
  });

  it('AC1: prefers the configured DocumentCategory.ORDER routing connection when one exists', async () => {
    storageSettingsService.findOne.mockResolvedValue({
      documentType: DocumentCategory.ORDER,
      storageConnection: { id: 42 },
    });

    const connectionId = await (service as any).resolveConnectionId();

    expect(connectionId).toBe(42);
    expect(storageSettingsService.findOne).toHaveBeenCalledWith(DocumentCategory.ORDER, null);
  });

  it('AC2: falls back to ORDERS_STORAGE_CONNECTION_ID env var when no routing row is configured', async () => {
    storageSettingsService.findOne.mockResolvedValue(null);
    process.env.ORDERS_STORAGE_CONNECTION_ID = '7';

    const connectionId = await (service as any).resolveConnectionId();

    expect(connectionId).toBe(7);
  });

  it('AC2: falls back to connection id 1 when neither routing nor env var is configured', async () => {
    storageSettingsService.findOne.mockResolvedValue(null);
    delete process.env.ORDERS_STORAGE_CONNECTION_ID;

    const connectionId = await (service as any).resolveConnectionId();

    expect(connectionId).toBe(1);
  });

  it('falls back when the routing row exists but has no storageConnection attached', async () => {
    storageSettingsService.findOne.mockResolvedValue({ documentType: DocumentCategory.ORDER, storageConnection: null });
    process.env.ORDERS_STORAGE_CONNECTION_ID = '3';

    const connectionId = await (service as any).resolveConnectionId();

    expect(connectionId).toBe(3);
  });
});
