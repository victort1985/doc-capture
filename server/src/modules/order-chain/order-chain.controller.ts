import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { OrderChainService, ChainDocType } from './order-chain.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type RequestUser = { id: number; organizationId: number | null };

@Controller('order-chain')
@UseGuards(JwtAuthGuard)
export class OrderChainController {
  constructor(private readonly service: OrderChainService) {}

  /** e.g. GET /order-chain/for/quote/42 — resolves quote #42's chain
   * (assigning it a fresh chainId first if it's never been linked to
   * anything) and returns every document sharing that chain. */
  @Get('for/:docType/:id')
  getForDocument(
    @Param('docType') docType: ChainDocType,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.getChainForDocument(docType, id, user.organizationId);
  }

  /** Manually attaches an existing document to another's chain — e.g.
   * POST /order-chain/link { sourceType: 'order', sourceId: 7,
   * targetType: 'quote', targetId: 3 } links order #7 into quote #3's
   * chain (folding in anything already linked to the order too). */
  @Post('link')
  link(
    @Body() body: { sourceType: ChainDocType; sourceId: number; targetType: ChainDocType; targetId: number },
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.linkDocuments(body.sourceType, body.sourceId, body.targetType, body.targetId, user.organizationId);
  }
}
