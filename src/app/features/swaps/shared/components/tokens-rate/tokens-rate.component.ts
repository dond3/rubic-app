import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { SwapsFormService } from '@features/swaps/core/services/swaps-form-service/swaps-form.service';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import BigNumber from 'bignumber.js';

interface TokenRate {
  amount: BigNumber;
  symbol: string;
}

interface TokensRate {
  from: TokenRate;
  to: TokenRate;
}

@Component({
  selector: 'app-tokens-rate',
  templateUrl: './tokens-rate.component.html',
  styleUrls: ['./tokens-rate.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TokensRateComponent implements OnInit {
  public tokensRate$: Observable<TokensRate>;

  public rateDirection: 'from' | 'to' = 'from';

  constructor(private readonly swapsFormService: SwapsFormService) {}

  ngOnInit() {
    this.tokensRate$ = this.swapsFormService.outputValue$.pipe(
      map(outputForm => {
        const { toAmount } = outputForm;

        if (toAmount?.isFinite()) {
          const { fromAmount, fromAsset, toToken } = this.swapsFormService.inputValue;

          return {
            from: {
              amount: fromAmount.dividedBy(toAmount),
              symbol: fromAsset.symbol
            },
            to: {
              amount: toAmount.dividedBy(fromAmount),
              symbol: toToken.symbol
            }
          };
        }

        return null;
      })
    );
  }

  public onChangeDirection(): void {
    this.rateDirection = this.rateDirection === 'from' ? 'to' : 'from';
  }
}
