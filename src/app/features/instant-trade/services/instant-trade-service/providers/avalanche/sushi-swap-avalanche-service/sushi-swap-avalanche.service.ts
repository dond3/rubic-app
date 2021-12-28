import { Injectable } from '@angular/core';
import { CommonUniswapV2Service } from 'src/app/features/instant-trade/services/instant-trade-service/providers/common/uniswap-v2/common-service/common-uniswap-v2.service';
import { SUSHI_SWAP_AVALANCHE_CONSTANTS } from '@features/instant-trade/services/instant-trade-service/providers/avalanche/sushi-swap-avalanche-service/sushi-swap-avalanche-constants';

@Injectable({
  providedIn: 'root'
})
export class SushiSwapAvalancheService extends CommonUniswapV2Service {
  constructor() {
    super(SUSHI_SWAP_AVALANCHE_CONSTANTS);
  }
}
