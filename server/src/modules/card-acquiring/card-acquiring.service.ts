import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CardAcquiringSettings, CardAcquiringProvider } from './entities/card-acquiring-settings.entity';

@Injectable()
export class CardAcquiringService {
  constructor(
    @InjectRepository(CardAcquiringSettings) private readonly repo: Repository<CardAcquiringSettings>,
  ) {}

  async getSettings(organizationId: number | null): Promise<CardAcquiringSettings> {
    const existing = await this.repo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (existing) return existing;
    return this.repo.create({ provider: CardAcquiringProvider.NONE });
  }

  async updateSettings(organizationId: number | null, provider: CardAcquiringProvider, apiKey?: string): Promise<CardAcquiringSettings> {
    let settings = await this.repo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (!settings) {
      settings = this.repo.create({ organization: organizationId != null ? ({ id: organizationId } as any) : undefined });
    }
    settings.provider = provider;
    if (apiKey !== undefined) settings.apiKey = apiKey || null;
    return this.repo.save(settings);
  }

  /** DELIBERATELY NOT IMPLEMENTED. This always throws, regardless of
   * what's configured in CardAcquiringSettings — storing a provider
   * choice and an API key is not the same as that provider actually
   * being integrated (no Stripe/Tranzila/CardCom SDK calls exist
   * anywhere in this codebase). A stub that pretended to succeed
   * would be actively dangerous — a false "payment successful"
   * message when no money actually moved is worse than no feature at
   * all. Implementing this for real means: picking one real provider
   * account, adding their SDK, and replacing this method's body with
   * an actual charge call against their API — at which point this
   * comment and the exception below should be deleted. */
  async charge(_organizationId: number | null, _amountIls: number, _cardToken: string): Promise<never> {
    throw new ServiceUnavailableException(
      'Direct card charging isn\'t connected to a real payment processor yet. Record this payment manually (cash/bank transfer/etc.) once the customer has actually paid, or contact your developer to wire up a real Stripe/Tranzila/CardCom account first.',
    );
  }
}
