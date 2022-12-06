import { Injectable } from '@angular/core';
import { AvailableTokenAmount } from '@shared/models/tokens/available-token-amount';
import { BehaviorSubject, Subject } from 'rxjs';
import { BlockchainName } from 'rubic-sdk';
import { TokensService } from '@core/services/tokens/tokens.service';
import { FormType } from '@features/swaps/shared/models/form/form-type';
import { TokensSelectComponentInput } from '@features/swaps/shared/components/tokens-selector/models/tokens-select-polymorpheus-data';
import { SelectorListType } from '@features/swaps/shared/components/tokens-selector/models/selector-list-type';
import { SwapFormInputControl } from '@app/features/swaps/core/services/swap-form-service/models/swap-form-controls';
import { FormGroup } from '@angular/forms';

@Injectable()
export class TokensSelectorService {
  /**
   * Form containing selected tokens and blockchains.
   */
  // @todo remove
  private _form: FormGroup<SwapFormInputControl>;

  public get form(): FormGroup<SwapFormInputControl> {
    return this._form;
  }

  private _formType: FormType;

  public get formType(): FormType {
    return this._formType;
  }

  private readonly _blockchain$ = new BehaviorSubject<BlockchainName>(undefined);

  public readonly blockchain$ = this._blockchain$.asObservable();

  public get blockchain(): BlockchainName {
    return this._blockchain$.value;
  }

  public set blockchain(value: BlockchainName) {
    this._blockchain$.next(value);
  }

  private readonly _tokenSelected$ = new Subject<AvailableTokenAmount>();

  public readonly tokenSelected$ = this._tokenSelected$.asObservable();

  private readonly _selectorListType$ = new BehaviorSubject<SelectorListType>('tokens');

  public readonly selectorListType$ = this._selectorListType$.asObservable();

  public get selectorListType(): SelectorListType {
    return this._selectorListType$.value;
  }

  private set selectorListType(value: SelectorListType) {
    this._selectorListType$.next(value);
  }

  constructor(private readonly tokensService: TokensService) {
    this.subscribeOnBlockchainChange();
  }

  public initParameters(context: Omit<TokensSelectComponentInput, 'idPrefix'>): void {
    this._form = context.form;
    this._formType = context.formType;

    const blockchainType = this.formType === 'from' ? 'fromBlockchain' : 'toBlockchain';
    this.blockchain = this.form.get(blockchainType).value;
  }

  private subscribeOnBlockchainChange(): void {
    this.blockchain$.subscribe(blockchain => {
      if (!blockchain) {
        return;
      }

      const tokenType = this.formType === 'from' ? 'fromToken' : 'toToken';
      if (!this.form.value[tokenType]) {
        const blockchainType = this.formType === 'from' ? 'fromBlockchain' : 'toBlockchain';
        if (this.form.get(blockchainType).value !== blockchain) {
          this.form.patchValue({
            [blockchainType]: this.blockchain
          });
        }
      }

      this.checkAndRefetchTokenList();
    });
  }

  private checkAndRefetchTokenList(): void {
    if (this.tokensService.needRefetchTokens) {
      this.tokensService.tokensRequestParameters = undefined;
    }
  }

  public switchSelectorType(): void {
    if (this.selectorListType === 'blockchains') {
      this.selectorListType = 'tokens';
    } else {
      this.selectorListType = 'blockchains';
    }
  }

  public onTokenSelect(token: AvailableTokenAmount): void {
    this._tokenSelected$.next(token);
  }
}
