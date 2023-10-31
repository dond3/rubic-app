import { Injectable } from '@angular/core';
import { combineLatestWith, forkJoin, of, Subject } from 'rxjs';
import { SwapsFormService } from '@features/trade/services/swaps-form/swaps-form.service';
import { catchError, debounceTime, filter, map, switchMap, tap } from 'rxjs/operators';
import { SdkService } from '@core/services/sdk/sdk.service';
import { SwapsStateService } from '@features/trade/services/swaps-state/swaps-state.service';
import { CrossChainService } from '@features/trade/services/cross-chain/cross-chain.service';
import { OnChainService } from '@features/trade/services/on-chain/on-chain.service';
import { CrossChainTrade } from 'rubic-sdk/lib/features/cross-chain/calculation-manager/providers/common/cross-chain-trade';
import { SelectedTrade } from '@features/trade/models/selected-trade';
import { ErrorsService } from '@core/errors/errors.service';
import { AuthService } from '@core/services/auth/auth.service';
import { TradePageService } from '@features/trade/services/trade-page/trade-page.service';

import { RefreshService } from '@features/trade/services/refresh-service/refresh.service';
import {
  CrossChainIsUnavailableError,
  CrossChainTradeType,
  LowSlippageError,
  NotSupportedTokensError,
  OnChainTradeType,
  RubicSdkError,
  UnsupportedReceiverAddressError,
  UpdatedRatesError,
  Web3Pure
} from 'rubic-sdk';
import { RubicError } from '@core/errors/models/rubic-error';
import { ERROR_TYPE } from '@core/errors/models/error-type';
import CrossChainIsUnavailableWarning from '@core/errors/models/cross-chain/cross-chainIs-unavailable-warning';
import TooLowAmountError from '@core/errors/models/common/too-low-amount-error';
import { RubicSdkErrorParser } from '@core/errors/models/rubic-sdk-error-parser';
import { ExecutionRevertedError } from '@core/errors/models/common/execution-reverted-error';
import CrossChainPairCurrentlyUnavailableError from '@core/errors/models/cross-chain/cross-chain-pair-currently-unavailable-error';
import NotWhitelistedProviderWarning from '@core/errors/models/common/not-whitelisted-provider-warning';
import UnsupportedDeflationTokenWarning from '@core/errors/models/common/unsupported-deflation-token.warning';
import { ModalService } from '@core/modals/services/modal.service';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '@features/trade/services/settings-service/settings.service';

@Injectable()
export class SwapsControllerService {
  private readonly _calculateTrade$ = new Subject<{ isForced?: boolean; stop?: boolean }>();

  public readonly calculateTrade$ = this._calculateTrade$.asObservable();

  /**
   * Contains trades types, which were disabled due to critical errors.
   */
  private disabledTradesTypes: { crossChain: CrossChainTradeType[]; onChain: OnChainTradeType[] } =
    {
      crossChain: [],
      onChain: []
    };

  constructor(
    private readonly swapFormService: SwapsFormService,
    private readonly sdkService: SdkService,
    private readonly swapsState: SwapsStateService,
    private readonly crossChainService: CrossChainService,
    private readonly onChainService: OnChainService,
    private readonly swapStateService: SwapsStateService,
    private readonly errorsService: ErrorsService,
    private readonly authService: AuthService,
    private readonly tradePageService: TradePageService,
    private readonly refreshService: RefreshService,
    private readonly modalService: ModalService,
    private readonly settingsService: SettingsService
  ) {
    this.subscribeOnFormChanges();
    this.subscribeOnCalculation();
    this.subscribeOnRefreshServiceCalls();
    this.subscribeOnAddressChange();
    this.subscribeOnSettings();
  }

  /**
   * Subscribes on input form changes and controls recalculation after it.
   */
  private subscribeOnFormChanges(): void {
    this.swapFormService.inputValueDistinct$.subscribe(() => {
      this.startRecalculation(true);
    });
  }

  private startRecalculation(isForced = false): void {
    this._calculateTrade$.next({ isForced });
  }

  private subscribeOnCalculation(): void {
    this.calculateTrade$
      .pipe(
        debounceTime(200),
        map(calculateData => {
          if (calculateData.stop || !this.swapFormService.isFilled) {
            this.refreshService.setStopped();
            // this.tradeStatus = TRADE_STATUS.DISABLED;

            // if (
            //   this.swapTypeService.getSwapProviderType() === SWAP_PROVIDER_TYPE.CROSS_CHAIN_ROUTING
            // ) {
            //   this.refreshService.setStopped();
            //   this.swapFormService.outputControl.patchValue({
            //     toAmount: new BigNumber(NaN)
            //   });
            // }

            return { ...calculateData, stop: true };
          }
          return { ...calculateData, stop: false };
        }),
        tap(calculateData => {
          if (!calculateData.stop) {
            this.refreshService.setRefreshing();
            this.swapsState.setCalculationProgress(1, 0);
            if (calculateData.isForced) {
              this.swapStateService.clearProviders();
            }
            this.swapStateService.patchCalculationState();
          }
        }),
        switchMap(calculateData => {
          if (calculateData.stop) {
            return of(null);
          }

          const { toBlockchain, fromToken } = this.swapFormService.inputValue;

          if (fromToken.blockchain === toBlockchain) {
            return this.onChainService.calculateTrades(this.disabledTradesTypes.onChain).pipe(
              catchError(err => {
                console.debug(err);
                return of(null);
              })
            );
          } else {
            return this.crossChainService.calculateTrades(this.disabledTradesTypes.crossChain).pipe(
              catchError(err => {
                console.debug(err);
                return of(null);
              })
            );
          }
        }),
        catchError(err => {
          console.debug(err);
          return of(null);
        }),
        switchMap(container => {
          const wrappedTrade = container?.value?.wrappedTrade;

          if (wrappedTrade) {
            const isCalculationEnd = container.value.total === container.value.calculated;
            const needApprove$ = wrappedTrade?.trade?.needApprove().catch(() => false) || of(false);
            return forkJoin([of(wrappedTrade), needApprove$, of(container.type)])
              .pipe(
                tap(([trade, needApprove, type]) => {
                  try {
                    this.swapsState.updateTrade(trade, type, needApprove);
                    this.swapsState.pickProvider(isCalculationEnd);
                    this.swapsState.setCalculationProgress(
                      container.value.total,
                      container.value.calculated
                    );
                    this.setTradeAmount();
                    if (isCalculationEnd) {
                      this.refreshService.setStopped();
                    }
                  } catch (err) {
                    console.error(err);
                  }
                })
              )
              .pipe(
                catchError(() => {
                  // this.swapsState.updateTrade(trade, type, needApprove);
                  this.swapsState.pickProvider(isCalculationEnd);
                  return of(null);
                })
              );
          }
          if (!container?.value) {
            this.refreshService.setStopped();
            this.swapStateService.clearProviders();
          }
          return of(null);
        }),
        catchError((_err: unknown) => {
          this.refreshService.setStopped();
          this.swapsState.pickProvider(true);
          return of(null);
        })
      )
      .subscribe();
  }

  private subscribeOnRefreshServiceCalls(): void {
    this.refreshService.onRefresh$.subscribe(() => {
      this.startRecalculation(false);
    });
  }

  private setTradeAmount(): void {
    const trade = this.swapsState.tradeState?.trade;
    if (trade) {
      this.swapFormService.outputControl.patchValue({
        toAmount: trade.to.tokenAmount
      });
    }
  }

  public async swap(
    tradeState: SelectedTrade,
    callback?: {
      onHash?: (hash: string) => void;
      onSwap?: (additionalInfo: { changenowId?: string }) => void;
      onError?: () => void;
    }
  ): Promise<void> {
    try {
      const additionalData: { changenowId?: string } = {
        changenowId: undefined
      };
      if (tradeState.trade instanceof CrossChainTrade) {
        await this.crossChainService.swapTrade(tradeState.trade, callback.onHash);
        if ('id' in tradeState.trade) {
          additionalData.changenowId = tradeState.trade.id as string;
        }
      } else {
        await this.onChainService.swapTrade(tradeState.trade, callback.onHash);
      }
      callback?.onSwap(additionalData);
    } catch (err) {
      if (err instanceof UpdatedRatesError && tradeState.trade instanceof CrossChainTrade) {
        const allowSwap = await firstValueFrom(
          this.modalService.openRateChangedModal(
            Web3Pure.fromWei(err.transaction.oldAmount, tradeState.trade.to.decimals),
            Web3Pure.fromWei(err.transaction.newAmount, tradeState.trade.to.decimals),
            tradeState.trade.to.symbol
          )
        );
        if (allowSwap) {
          try {
            const additionalData: { changenowId?: string } = {
              changenowId: undefined
            };
            await this.crossChainService.swapTrade(
              tradeState.trade as CrossChainTrade,
              callback.onHash,
              err.transaction
            );
            if ('id' in tradeState.trade) {
              additionalData.changenowId = tradeState.trade.id as string;
            }
            callback?.onSwap(additionalData);
          } catch (innerErr) {
            this.catchSwapError(err, tradeState, callback?.onError);
          }
          return;
        } else {
          this.tradePageService.setState('form');
        }
      } else {
        this.catchSwapError(err, tradeState, callback?.onError);
      }
    }
  }

  public async approve(
    tradeState: SelectedTrade,
    callback?: {
      onHash?: (hash: string) => void;
      onSwap?: () => void;
      onError?: () => void;
    }
  ): Promise<void> {
    try {
      if (tradeState.trade instanceof CrossChainTrade) {
        await this.crossChainService.approveTrade(tradeState.trade, callback.onHash);
      } else {
        await this.onChainService.approveTrade(tradeState.trade, callback.onHash);
      }
      callback?.onSwap();
    } catch (err) {
      console.error(err);
      callback?.onError();
      this.errorsService.catch(err);
    }
  }

  private subscribeOnAddressChange(): void {
    this.authService.currentUser$
      .pipe(
        switchMap(() => this.swapFormService.isFilled$),
        filter(isFilled => isFilled)
      )
      .subscribe(() => {
        this.startRecalculation(false);
      });
  }

  private parseCalculationError(error?: RubicSdkError): RubicError<ERROR_TYPE> {
    if (error instanceof NotSupportedTokensError) {
      return new RubicError('Currently, Rubic does not support swaps between these tokens.');
    }
    if (error instanceof UnsupportedReceiverAddressError) {
      return new RubicError('This provider doesn’t support the receiver address.');
    }
    if (error instanceof CrossChainIsUnavailableError) {
      return new CrossChainIsUnavailableWarning();
    }
    if (error instanceof LowSlippageError) {
      return new RubicError('Slippage is too low for transaction.');
    }
    if (error instanceof TooLowAmountError) {
      return new RubicError(
        "The swap can't be executed with the entered amount of tokens. Please change it to the greater amount."
      );
    }
    if (error?.message?.includes('No available routes')) {
      return new RubicError('No available routes.');
    }
    if (error?.message?.includes('There are no providers for trade')) {
      return new RubicError('There are no providers for trade.');
    }
    if (error?.message?.includes('Representation of ')) {
      return new RubicError('The swap between this pair of blockchains is currently unavailable.');
    }

    const parsedError = error && RubicSdkErrorParser.parseError(error);
    if (!parsedError || parsedError instanceof ExecutionRevertedError) {
      return new CrossChainPairCurrentlyUnavailableError();
    } else {
      return parsedError;
    }
  }

  private isExecutionCriticalError(error: RubicError<ERROR_TYPE>): boolean {
    return [
      NotWhitelistedProviderWarning,
      UnsupportedDeflationTokenWarning,
      ExecutionRevertedError
    ].some(CriticalError => error instanceof CriticalError);
  }

  private catchSwapError(
    err: RubicSdkError,
    tradeState: SelectedTrade,
    onError?: () => void
  ): void {
    console.error(err);
    const parsedError = this.parseCalculationError(err);
    if (this.isExecutionCriticalError(parsedError)) {
      if (tradeState.trade instanceof CrossChainTrade) {
        this.disabledTradesTypes.crossChain.push(tradeState.trade.type);
      } else {
        this.disabledTradesTypes.onChain.push(tradeState.trade.type);
      }
    }
    onError?.();
    this.errorsService.catch(err);
  }

  private subscribeOnSettings(): void {
    this.settingsService.crossChainRoutingValueChanges
      .pipe(combineLatestWith(this.settingsService.instantTradeValueChanges))
      .subscribe(() => {
        this.startRecalculation(true);
      });
  }
}
