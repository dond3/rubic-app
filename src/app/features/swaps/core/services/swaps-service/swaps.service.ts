import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { SwapsFormService } from '@features/swaps/core/services/swaps-form-service/swaps-form.service';
import { filter, pairwise, startWith } from 'rxjs/operators';
import { TokensService } from '@core/services/tokens/tokens.service';
import { TokenAmount } from '@shared/models/tokens/token-amount';
import { List } from 'immutable';
import { compareTokens } from '@shared/utils/utils';
import { SWAP_PROVIDER_TYPE } from '@features/swaps/features/swaps-form/models/swap-provider-type';
import { SwapFormInput } from '../swaps-form-service/models/swap-form-controls';
import { isMinimalToken } from '@shared/utils/is-token';
import { compareAssets } from '@features/swaps/shared/utils/compare-assets';

@Injectable()
export class SwapsService {
  private _swapProviderType$ = new BehaviorSubject<SWAP_PROVIDER_TYPE>(undefined);

  private _availableTokens$ = new BehaviorSubject<List<TokenAmount>>(undefined);

  private _availableFavoriteTokens$ = new BehaviorSubject<List<TokenAmount>>(undefined);

  private intervalId: NodeJS.Timeout;

  get availableTokens$(): Observable<List<TokenAmount>> {
    return this._availableTokens$.asObservable();
  }

  get availableFavoriteTokens$(): Observable<List<TokenAmount>> {
    return this._availableFavoriteTokens$.asObservable();
  }

  get swapMode$(): Observable<SWAP_PROVIDER_TYPE | null> {
    return this._swapProviderType$.asObservable();
  }

  get swapMode(): SWAP_PROVIDER_TYPE | null {
    return this._swapProviderType$.getValue();
  }

  set swapMode(swapType: SWAP_PROVIDER_TYPE) {
    this._swapProviderType$.next(swapType);
  }

  constructor(
    private readonly swapsFormService: SwapsFormService,
    private readonly tokensService: TokensService
  ) {
    this.subscribeOnTokens();
    this.subscribeOnForm();
  }

  private subscribeOnTokens(): void {
    combineLatest([
      this.tokensService.tokens$.pipe(filter(tokens => !!tokens)),
      this.tokensService.favoriteTokens$
    ]).subscribe(([tokenAmounts, favoriteTokenAmounts]) => {
      const updatedTokenAmounts = tokenAmounts.toArray();
      const updatedFavoriteTokenAmounts = favoriteTokenAmounts.toArray();

      this._availableTokens$.next(List(updatedTokenAmounts));

      const availableFavoriteTokens = List(
        updatedFavoriteTokenAmounts.filter(tokenA =>
          favoriteTokenAmounts.some(tokenB => compareTokens(tokenA, tokenB))
        )
      );
      this._availableFavoriteTokens$.next(availableFavoriteTokens);
    });
  }

  private subscribeOnForm(): void {
    this.swapsFormService.inputValue$
      .pipe(startWith(null), pairwise())
      .subscribe(([prevForm, curForm]) => {
        this.setSwapProviderType(curForm);

        if (
          (!compareAssets(prevForm?.fromAsset, curForm.fromAsset) &&
            isMinimalToken(curForm.fromAsset)) ||
          (!TokensService.areTokensEqual(prevForm?.toToken, curForm.toToken) && curForm.toToken)
        ) {
          this.updateTokensPrices(curForm);
        }

        if (
          !compareAssets(prevForm?.fromAsset, curForm.fromAsset) &&
          isMinimalToken(curForm.fromAsset)
        ) {
          this.updateTokenBalance(curForm.fromAsset);
        }
      });
  }

  private setSwapProviderType(form: SwapFormInput): void {
    const { fromAssetType, toBlockchain } = form;

    if (fromAssetType === 'fiat') {
      this.swapMode = SWAP_PROVIDER_TYPE.ONRAMPER;
    } else if (!fromAssetType || !toBlockchain || fromAssetType === toBlockchain) {
      this.swapMode = SWAP_PROVIDER_TYPE.INSTANT_TRADE;
    } else {
      this.swapMode = SWAP_PROVIDER_TYPE.CROSS_CHAIN_ROUTING;
    }
  }

  /**
   * Takes selected tokens from {@param form} and call functions to update their prices.
   * Sets interval to update prices.
   * @param form Input form, which contains selected tokens.
   */
  private updateTokensPrices(form: SwapFormInput): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    const update = () => {
      if (isMinimalToken(form?.fromAsset)) {
        this.tokensService.getAndUpdateTokenPrice(form.fromAsset);
      }
      if (form?.toToken) {
        this.tokensService.getAndUpdateTokenPrice(form.toToken);
      }
    };

    update();
    this.intervalId = setInterval(update, 15_000);
  }

  /**
   * Calls functions to update balance, if needed.
   */
  private updateTokenBalance(fromToken: TokenAmount): void {
    if (!fromToken.amount?.isFinite()) {
      this.tokensService.getAndUpdateTokenBalance(fromToken);
    }
  }
}
