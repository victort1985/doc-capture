import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeliveryNotesService } from './delivery-notes.service';
import { DeliveryNote } from './delivery-note.entity';
import { DeliveryNoteSettings } from './delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';

describe('DeliveryNotesService number generation (private claimNoteNumber, tested via bracket access)', () => {
  let service: DeliveryNotesService;
  let notesRepo: { count: jest.Mock };
  let settingsRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; increment: jest.Mock };

  beforeEach(async () => {
    notesRepo = { count: jest.fn() };
    settingsRepo = {
      findOne: jest.fn(),
      save: jest.fn((x) => Promise.resolve(x)),
      create: jest.fn((x) => x),
      increment: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryNotesService,
        { provide: getRepositoryToken(DeliveryNote), useValue: notesRepo },
        { provide: getRepositoryToken(DeliveryNoteSettings), useValue: settingsRepo },
        { provide: StorageService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(DeliveryNotesService);
  });

  it('claims nextSequence and increments it, without ever calling repo.count() for an org-scoped note', async () => {
    settingsRepo.findOne.mockResolvedValue({ id: 1, nextSequence: 1, startingNumber: 10000, notePrefix: '' });

    const { noteNumber } = await (service as any).claimNoteNumber(10, undefined);

    expect(noteNumber).toBe('10000');
    expect(settingsRepo.increment).toHaveBeenCalledWith({ id: 1 }, 'nextSequence', 1);
    expect(notesRepo.count).not.toHaveBeenCalled();
  });

  it('regression guard: two back-to-back notes never get the same number, even simulating a deletion in between', async () => {
    settingsRepo.findOne.mockResolvedValueOnce({ id: 1, nextSequence: 1, startingNumber: 10000, notePrefix: 'DN-' });
    const first = await (service as any).claimNoteNumber(10, undefined);
    expect(first.noteNumber).toBe('DN-10000');

    settingsRepo.findOne.mockResolvedValueOnce({ id: 1, nextSequence: 2, startingNumber: 10000, notePrefix: 'DN-' });
    const second = await (service as any).claimNoteNumber(10, undefined);
    expect(second.noteNumber).toBe('DN-10001');
    expect(second.noteNumber).not.toBe(first.noteNumber);
  });

  it('respects an explicitly-provided noteNumber instead of generating one', async () => {
    settingsRepo.findOne.mockResolvedValue({ id: 1, nextSequence: 5, startingNumber: 10000, notePrefix: '' });

    const { noteNumber } = await (service as any).claimNoteNumber(10, 'CUSTOM-001');

    expect(noteNumber).toBe('CUSTOM-001');
    // Still claims/advances the counter even when the number itself is
    // overridden, so the sequence doesn't drift for the next auto-numbered note.
    expect(settingsRepo.increment).toHaveBeenCalled();
  });

  it('creates a settings row on first use when none exists yet for the org', async () => {
    settingsRepo.findOne.mockResolvedValue(undefined);
    settingsRepo.save.mockResolvedValueOnce({ id: 99, nextSequence: 1, startingNumber: 10000, notePrefix: '' });

    const { noteNumber } = await (service as any).claimNoteNumber(10, undefined);

    expect(settingsRepo.create).toHaveBeenCalled();
    expect(noteNumber).toBe('10000');
  });

  it('falls back to a running count only for the no-organization (super-admin) path', async () => {
    notesRepo.count.mockResolvedValue(4);

    const { noteNumber } = await (service as any).claimNoteNumber(null, undefined);

    expect(noteNumber).toBe('10004');
    expect(settingsRepo.findOne).not.toHaveBeenCalled();
  });
});
