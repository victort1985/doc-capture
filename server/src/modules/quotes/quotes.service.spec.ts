import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QuotesService } from './quotes.service';
import { Quote } from './entities/quote.entity';
import { QuoteSettings } from './entities/quote-settings.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { DocumentSendingService } from '../document-email/document-sending.service';

describe('QuotesService number generation (private generateQuoteNumber, tested via bracket access)', () => {
  let service: QuotesService;
  let quotesRepo: { count: jest.Mock };
  let settingsRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; increment: jest.Mock };

  beforeEach(async () => {
    quotesRepo = { count: jest.fn() };
    settingsRepo = {
      findOne: jest.fn(),
      save: jest.fn((x) => Promise.resolve(x)),
      create: jest.fn((x) => x),
      increment: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: getRepositoryToken(Quote), useValue: quotesRepo },
        { provide: getRepositoryToken(QuoteSettings), useValue: settingsRepo },
        { provide: getRepositoryToken(DeliveryNoteSettings), useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: DocumentSendingService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(QuotesService);
  });

  it('AC3/AC4: claims nextSequence and increments it, without ever calling repo.count() for an org-scoped quote', async () => {
    settingsRepo.findOne.mockResolvedValue({ id: 1, nextSequence: 5, numberLocked: false, startingNumber: null, numberPrefix: null });

    const number = await (service as any).generateQuoteNumber(10);

    expect(number).toBe('#5');
    expect(settingsRepo.increment).toHaveBeenCalledWith({ id: 1 }, 'nextSequence', 1);
    expect(quotesRepo.count).not.toHaveBeenCalled();
  });

  it('AC3: two back-to-back calls never return the same number, even simulating a row deleted in between', async () => {
    // First call: settings currently at nextSequence=1.
    settingsRepo.findOne.mockResolvedValueOnce({ id: 1, nextSequence: 1, numberLocked: false, startingNumber: null, numberPrefix: null });
    const first = await (service as any).generateQuoteNumber(10);
    expect(first).toBe('#1');

    // Second call: nextSequence has moved to 2 via increment (simulated
    // here since we're mocking the repo, not a real DB) - this must
    // hold true regardless of whether the quote from call 1 still
    // exists, which is exactly the scenario that broke under the old
    // COUNT(*)-based implementation (deleting quote #1 would have
    // reset the count back to 0, reissuing "#1" again).
    settingsRepo.findOne.mockResolvedValueOnce({ id: 1, nextSequence: 2, numberLocked: false, startingNumber: null, numberPrefix: null });
    const second = await (service as any).generateQuoteNumber(10);
    expect(second).toBe('#2');
    expect(second).not.toBe(first);
  });

  it('creates a settings row on first use when none exists yet for the org', async () => {
    settingsRepo.findOne.mockResolvedValue(undefined);
    settingsRepo.save.mockResolvedValueOnce({ id: 99, nextSequence: 1, numberLocked: false, startingNumber: null, numberPrefix: null });

    const number = await (service as any).generateQuoteNumber(10);

    expect(settingsRepo.create).toHaveBeenCalled();
    expect(number).toBe('#1');
  });

  it('applies prefix + startingNumber when numbering is locked', async () => {
    settingsRepo.findOne.mockResolvedValue({ id: 1, nextSequence: 3, numberLocked: true, startingNumber: 1000, numberPrefix: 'DQ' });

    const number = await (service as any).generateQuoteNumber(10);

    expect(number).toBe('DQ1002'); // startingNumber + claimed(3) - 1
  });

  it('falls back to a running count only for the no-organization (super-admin) path', async () => {
    quotesRepo.count.mockResolvedValue(4);

    const number = await (service as any).generateQuoteNumber(null);

    expect(number).toBe('#5');
    expect(settingsRepo.findOne).not.toHaveBeenCalled();
  });
});
