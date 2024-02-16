import { Inject, Injectable, Injector } from '@angular/core';
import { combineLatestWith } from 'rxjs';
import { debounceTime, map, share, startWith } from 'rxjs/operators';
import { BlockchainsInfo, ChangenowCrossChainTrade } from 'rubic-sdk';
import { TRADE_STATUS } from '@shared/models/swaps/trade-status';
import { SwapsStateService } from '@features/trade/services/swaps-state/swaps-state.service';
import { WalletConnectorService } from '@core/services/wallets/wallet-connector-service/wallet-connector.service';
import { TradePageService } from '@features/trade/services/trade-page/trade-page.service';
import { ModalService } from '@core/modals/services/modal.service';
import { PreviewSwapService } from '@features/trade/services/preview-swap/preview-swap.service';
import { TargetNetworkAddressService } from '@features/trade/services/target-network-address-service/target-network-address.service';
import { SelectedTrade } from '@features/trade/models/selected-trade';

@Injectable()
export class ActionButtonService {
  private readonly stateParams$ = this.tradeState.tradeState$.pipe(
    combineLatestWith(
      this.tradeState.wrongBlockchain$,
      this.tradeState.notEnoughBalance$,
      this.walletConnector.addressChange$,
      this.targetNetworkAddressService.isAddressValid$,
      this.targetNetworkAddressService.isAddressRequired$,
      this.targetNetworkAddressService.address$
    ),
    debounceTime(10),
    share()
  );

  public readonly buttonState$ = this.stateParams$.pipe(
    map(params => this.getState(...params)),
    startWith({
      type: 'error',
      text: 'Select tokens',
      action: () => {}
    })
  );

  constructor(
    private readonly tradeState: SwapsStateService,
    private readonly walletConnector: WalletConnectorService,
    private readonly tradePageService: TradePageService,
    private readonly modalService: ModalService,
    @Inject(Injector) private readonly injector: Injector,
    private readonly previewSwapService: PreviewSwapService,
    private readonly targetNetworkAddressService: TargetNetworkAddressService
  ) {}

  private swap(): void {
    this.tradePageService.setState('preview');
  }

  private swapCn(): void {
    this.tradePageService.setState('cnPreview');
  }

  private connectWallet(): void {
    this.modalService.openWalletModal(this.injector).subscribe();
  }

  private getState(
    currentTrade: SelectedTrade | null,
    wrongBlockchain: boolean,
    notEnoughBalance: boolean,
    address: string,
    isReceiverValid: boolean,
    isAddressRequired: boolean,
    receiverAddress: string
  ): {
    type: 'error' | 'action';
    text: string;
    action: () => void;
  } {
    if (currentTrade.error) {
      return {
        type: 'error',
        text: currentTrade.error.message,
        action: () => {}
      };
    }

    if (!address) {
      return {
        type: 'action',
        text: 'Connect wallet',
        action: this.connectWallet.bind(this)
      };
    }
    if (notEnoughBalance) {
      return {
        type: 'error',
        text: 'Insufficient balance',
        action: () => {}
      };
    }
    const isCnFromNonEvm =
      currentTrade.trade instanceof ChangenowCrossChainTrade &&
      !BlockchainsInfo.isEvmBlockchainName(currentTrade.trade.from.blockchain);

    if (
      currentTrade.status === TRADE_STATUS.READY_TO_SWAP ||
      currentTrade.status === TRADE_STATUS.READY_TO_APPROVE ||
      (currentTrade.trade && wrongBlockchain)
    ) {
      // Handle Non EVM trade
      if (isAddressRequired) {
        const trulyAddress = Boolean(receiverAddress);

        if (isReceiverValid && trulyAddress) {
          if (isCnFromNonEvm) {
            return {
              type: 'action',
              text: 'Preview swap',
              action: this.swapCn.bind(this)
            };
          }
          return {
            type: 'action',
            text: 'Preview swap',
            action: this.swap.bind(this)
          };
        }
        return {
          type: 'error',
          text: 'Enter receiver address',
          action: () => {}
        };
      } else {
        if (!isReceiverValid) {
          return {
            type: 'error',
            text: 'Enter correct receiver address',
            action: () => {}
          };
        }
        return {
          type: 'action',
          text: 'Preview swap',
          action: this.swap.bind(this)
        };
      }
    }
    if (currentTrade.status === TRADE_STATUS.LOADING) {
      return {
        type: 'error',
        text: 'Calculating',
        action: () => {}
      };
    }
    if (currentTrade.status === TRADE_STATUS.NOT_INITIATED) {
      return {
        type: 'error',
        text: 'Select tokens',
        action: () => {}
      };
    }
    return {
      type: 'error',
      text: 'Trade is not available',
      action: () => {}
    };
  }

  private getDefaultParams(): [SelectedTrade, boolean, boolean, string, boolean, boolean, string] {
    return [null, false, false, '', true, false, ''];
  }
}
