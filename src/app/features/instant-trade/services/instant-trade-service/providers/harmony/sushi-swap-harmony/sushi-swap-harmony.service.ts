import { Injectable } from '@angular/core';
import { CommonUniswapV2Service } from 'src/app/features/instant-trade/services/instant-trade-service/providers/common/uniswap-v2/common-service/common-uniswap-v2.service';
import { SUSHI_SWAP_HARMONY_CONSTANTS } from 'src/app/features/instant-trade/services/instant-trade-service/providers/harmony/sushi-swap-harmony/sushi-swap-harmony.constants';

@Injectable({
  providedIn: 'root'
})
export class SushiSwapHarmonyService extends CommonUniswapV2Service {
  constructor() {
    super(SUSHI_SWAP_HARMONY_CONSTANTS);
  }
}
