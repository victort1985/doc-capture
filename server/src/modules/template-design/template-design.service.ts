import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateDesignSettings } from './entities/template-design-settings.entity';
import { UpdateTemplateDesignDto } from './dto/update-template-design.dto';
import type { TemplateDesignConfig } from '../documents/document-pdf.util';

@Injectable()
export class TemplateDesignService {
  constructor(@InjectRepository(TemplateDesignSettings) private readonly repo: Repository<TemplateDesignSettings>) {}

  async findOrCreate(organizationId: number): Promise<TemplateDesignSettings> {
    let s = await this.repo.findOne({ where: { organization: { id: organizationId } } });
    if (!s) {
      s = await this.repo.save(this.repo.create({ organization: { id: organizationId } as any }));
    }
    return s;
  }

  async update(organizationId: number, dto: UpdateTemplateDesignDto): Promise<TemplateDesignSettings> {
    const s = await this.findOrCreate(organizationId);
    if (dto.primaryColor !== undefined) s.primaryColor = dto.primaryColor;
    if (dto.accentColor !== undefined) s.accentColor = dto.accentColor;
    if (dto.textColor !== undefined) s.textColor = dto.textColor;
    if (dto.logoXPercent !== undefined) s.logoXPercent = dto.logoXPercent;
    if (dto.logoYPercent !== undefined) s.logoYPercent = dto.logoYPercent;
    if (dto.logoHeightPercent !== undefined) s.logoHeightPercent = dto.logoHeightPercent;
    if (dto.companyInfoXPercent !== undefined) s.companyInfoXPercent = dto.companyInfoXPercent;
    if (dto.companyInfoYPercent !== undefined) s.companyInfoYPercent = dto.companyInfoYPercent;
    return this.repo.save(s);
  }

  /** Converts the stored entity into the shape document-pdf.util.ts's
   * generateDocumentPdf() actually expects — every document-type
   * service (quotes/invoices/etc) calls this once and spreads the
   * result into its `design` param, rather than each one re-deriving
   * this mapping itself. Returns undefined (not an empty object) when
   * nothing has been customized, so the template's own defaults are
   * used untouched rather than an object full of undefined fields
   * silently overriding them with... undefined (which resolvePalette
   * etc already handle fine either way, but returning undefined here
   * keeps callers' intent obvious: "no override" vs "override with
   * nothing"). */
  async getConfigForOrg(organizationId: number | null): Promise<TemplateDesignConfig | undefined> {
    if (organizationId == null) return undefined;
    const s = await this.repo.findOne({ where: { organization: { id: organizationId } } });
    if (!s) return undefined;
    const hasColors = s.primaryColor || s.accentColor || s.textColor;
    const hasLogo = s.logoXPercent != null && s.logoYPercent != null && s.logoHeightPercent != null;
    const hasCompanyInfo = s.companyInfoXPercent != null && s.companyInfoYPercent != null;
    if (!hasColors && !hasLogo && !hasCompanyInfo) return undefined;
    return {
      colors: hasColors ? { primary: s.primaryColor ?? undefined, accent: s.accentColor ?? undefined, text: s.textColor ?? undefined } : undefined,
      logo: hasLogo ? { xPercent: Number(s.logoXPercent), yPercent: Number(s.logoYPercent), heightPercent: Number(s.logoHeightPercent) } : undefined,
      companyInfo: hasCompanyInfo ? { xPercent: Number(s.companyInfoXPercent), yPercent: Number(s.companyInfoYPercent) } : undefined,
    };
  }
}
