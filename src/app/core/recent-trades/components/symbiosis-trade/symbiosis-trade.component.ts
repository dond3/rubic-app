import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from '@angular/core';
import { TuiDestroyService } from '@taiga-ui/cdk';
import { RecentTradesService } from '../../services/recent-trades.service';
import { RecentTradeStatus } from '../../models/recent-trade-status.enum';
import { RecentTradesStoreService } from '@app/core/services/recent-trades/recent-trades-store.service';
import { UiRecentTrade } from '../../models/ui-recent-trade.interface';
import { CommonTrade } from '../../models/common-trade';
import { RecentTrade } from '@app/shared/models/my-trades/recent-trades.interface';
import { CROSS_CHAIN_TRADE_TYPE } from 'rubic-sdk';

@Component({
  selector: '[symbiosis-trade]',
  templateUrl: './symbiosis-trade.component.html',
  styleUrls: ['./symbiosis-trade.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SymbiosisTradeComponent extends CommonTrade {
  public revertBtnLoading = false;

  constructor(
    private readonly recentTradesService: RecentTradesService,
    protected readonly recentTradesStoreService: RecentTradesStoreService,
    protected readonly cdr: ChangeDetectorRef,
    @Inject(TuiDestroyService) protected readonly destroy$: TuiDestroyService
  ) {
    super(recentTradesStoreService, cdr, destroy$);
  }

  public async getTradeData(trade: RecentTrade): Promise<UiRecentTrade> {
    return await this.recentTradesService.getTradeData(trade, CROSS_CHAIN_TRADE_TYPE.SYMBIOSIS);
  }

  public setUiTrade(uiTrade: UiRecentTrade): void {
    if (!this.uiTrade || this.uiTrade?.statusTo !== RecentTradeStatus.FALLBACK) {
      this.uiTrade = uiTrade;

      if (this.initialLoading) {
        this.initialLoading = false;
      }
    }
  }

  public async revertSymbiosis(): Promise<void> {
    this.revertBtnLoading = true;

    const revertTxReceipt = await this.recentTradesService.revertSymbiosis(
      this.trade.srcTxHash,
      this.trade.fromBlockchain
    );

    if (revertTxReceipt.status) {
      this.uiTrade.statusTo = RecentTradeStatus.FALLBACK;
      this.revertBtnLoading = false;
      this.cdr.detectChanges();
    }
  }
}
