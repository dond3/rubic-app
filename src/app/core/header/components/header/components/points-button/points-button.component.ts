import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ROUTE_PATH } from '@shared/constants/common/links';
import { Router } from '@angular/router';
import { AirdropService } from '@features/airdrop/services/airdrop.service';
import { map } from 'rxjs/operators';
import { AuthService } from '@core/services/auth/auth.service';

@Component({
  selector: 'app-points-button',
  templateUrl: './points-button.component.html',
  styleUrls: ['./points-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PointsButtonComponent {
  public readonly points$ = this.swapAndEarnStateService.points$.pipe(
    map(points => points.pending + points.confirmed)
  );

  public readonly isAuth$ = this.authServices.currentUser$;

  constructor(
    private readonly router: Router,
    private readonly authServices: AuthService,
    private readonly swapAndEarnStateService: AirdropService
  ) {}

  public async navigateToSwapAndEarn(): Promise<void> {
    await this.router.navigate([ROUTE_PATH.AIRDROP], { queryParamsHandling: '' });
  }
}
