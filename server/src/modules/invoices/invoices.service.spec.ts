import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service';
import { Invoice } from './entities/invoice.entity';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { StorageService } from '../storage/storage.service';
import { DocumentSendingService } from '../document-email/document-sending.service';

describe('InvoicesService number generation (private generateInvoiceNumber, tested via bracket access)', () => {
  let service: InvoicesService;
  let invoicesRepo: { count: jest.Mock };
  let settingsRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; increment: jest.Mock };

  beforeEach(async () => {
    invoicesRepo = { count: jest.fn() };
    settingsRepo = {
      findOne: jest.fn(),
      save: jest.fn((x) => Promise.resolve(x)),
      create: jest.fn((x) => x),
      increment: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: getRepositoryToken(Invoice), useValue: invoicesRepo },
        { provide: getRepositoryToken(InvoiceSettings), useValue: settingsRepo },
        { provide: getRepositoryToken(DeliveryNoteSettings), useValue: {} },
        { provide: getRepositoryToken(Quote), useValue: {} },
        { provide: getRepositoryToken(DeliveryNote), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: DocumentSendingService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(InvoicesService);
  });

  it('AC3/AC4: claims nextSequence and increments it, without ever calling repo.count() for an org-scoped invoice', async () => {
    settingsRepo.findOne.mockResolvedValue({ id: 1, nextSequence: 5, numberLocked: false, startingNumber: null, numberPrefix: null });

    const number = await (service as any).generateInvoiceNumber(10);

    expect(number).toBe('#5');
    expect(settingsRepo.increment).toHaveBeenCalledWith({ id: 1 }, 'nextSequence', 1);
    expect(invoicesRepo.count).not.toHaveBeenCalled();
  });

  it('AC3: two back-to-back calls never return the same number, even simulating a row deleted in between', async () => {
    settingsRepo.findOne.mockResolvedValueOnce({ id: 1, nextSequence: 1, numberLocked: false, startingNumber: null, numberPrefix: null });
    const first = await (service as any).generateInvoiceNumber(10);
    expect(first).toBe('#1');

    settingsRepo.findOne.mockResolvedValueOnce({ id: 1, nextSequence: 2, numberLocked: false, startingNumber: null, numberPrefix: null });
    const second = await (service as any).generateInvoiceNumber(10);
    expect(second).toBe('#2');
    expect(second).not.toBe(first);
  });

  it('applies prefix + startingNumber when numbering is locked', async () => {
    settingsRepo.findOne.mockResolvedValue({ id: 1, nextSequence: 3, numberLocked: true, startingNumber: 1000, numberPrefix: 'INV' });

    const number = await (service as any).generateInvoiceNumber(10);

    expect(number).toBe('INV1002');
  });

  it('falls back to a running count only for the no-organization (super-admin) path', async () => {
    invoicesRepo.count.mockResolvedValue(4);

    const number = await (service as any).generateInvoiceNumber(null);

    expect(number).toBe('#5');
    expect(settingsRepo.findOne).not.toHaveBeenCalled();
  });
});
