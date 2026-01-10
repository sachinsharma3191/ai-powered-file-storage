import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { RateLimitInfo } from '../../services/storage.service';

@Component({
  selector: 'app-rate-limit-status',
  standalone: true,
  template: `
    <div class="rate-limit-status" 
         [class.alert-warning]="warningLevel === 'warning'"
         [class.alert-danger]="warningLevel === 'critical'"
         [class.alert-success]="warningLevel === 'normal'"
         class="alert d-flex align-items-center">
      
      <!-- Status Icon -->
      <div class="me-3">
        <svg class="status-icon" 
             [class.text-success]="warningLevel === 'normal'"
             [class.text-warning]="warningLevel === 'warning'"
             [class.text-danger]="warningLevel === 'critical'"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <!-- Normal: Check circle -->
          <g *ngIf="warningLevel === 'normal'">
            <path d="M22,11.08V12a10,10,0,1,1-5.93-9.14"/>
            <polyline points="22,4 12,14.01 9,11.01"/>
          </g>
          <!-- Warning: Alert triangle -->
          <g *ngIf="warningLevel === 'warning'">
            <path d="M10.29,3.86L1.82,18a2,2,0,0,0,1.71,3h16.94a2,2,0,0,0,1.71-3L13.71,3.86A2,2,0,0,0,10.29,3.86Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </g>
          <!-- Critical: X circle -->
          <g *ngIf="warningLevel === 'critical'">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </g>
        </svg>
      </div>

      <!-- Rate Limit Info -->
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between align-items-center">
          <strong>API Rate Limit</strong>
          <small class="text-muted">{{ timeUntilReset }}</small>
        </div>
        
        <!-- Progress Bar -->
        <div class="progress mt-2" style="height: 8px;">
          <div class="progress-bar" 
               [class.bg-success]="percentageUsed < 50"
               [class.bg-warning]="percentageUsed >= 50 && percentageUsed < 80"
               [class.bg-danger]="percentageUsed >= 80"
               [style.width.%]="percentageUsed">
          </div>
        </div>
        
        <div class="d-flex justify-content-between mt-1">
          <small>
            {{ rateLimitInfo?.remaining || 0 }}/{{ rateLimitInfo?.limit || 0 }} requests remaining
          </small>
          <small>
            {{ percentageUsed }}% used
          </small>
        </div>
      </div>

      <!-- Actions -->
      <div class="ms-3">
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" 
                  type="button" 
                  data-bs-toggle="dropdown">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="1"/>
              <circle cx="12" cy="5" r="1"/>
              <circle cx="12" cy="19" r="1"/>
            </svg>
          </button>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href="#" (click)="refreshLimits()">Refresh Status</a></li>
            <li><a class="dropdown-item" href="#" (click)="showDetails()">View Details</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item" href="#" (click)="learnMore()">Learn About Rate Limits</a></li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Details Modal -->
    <div class="modal fade" id="rateLimitDetails" tabindex="-1" *ngIf="showDetailsModal">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Rate Limit Details</h5>
            <button type="button" class="btn-close" (click)="closeDetails()"></button>
          </div>
          <div class="modal-body">
            <div class="row mb-3">
              <div class="col-6">
                <div class="text-center">
                  <h3 class="text-primary">{{ rateLimitInfo?.limit || 0 }}</h3>
                  <p class="text-muted mb-0">Total Limit</p>
                </div>
              </div>
              <div class="col-6">
                <div class="text-center">
                  <h3 [class.text-success]="percentageUsed < 50"
                      [class.text-warning]="percentageUsed >= 50 && percentageUsed < 80"
                      [class.text-danger]="percentageUsed >= 80">
                    {{ rateLimitInfo?.remaining || 0 }}
                  </h3>
                  <p class="text-muted mb-0">Remaining</p>
                </div>
              </div>
            </div>

            <div class="alert alert-info">
              <h6>Rate Limit Information</h6>
              <ul class="mb-0">
                <li><strong>Window:</strong> Resets every {{ rateLimitInfo?.reset || 60 }} seconds</li>
                <li><strong>Current Usage:</strong> {{ (rateLimitInfo?.limit || 0) - (rateLimitInfo?.remaining || 0) }} requests</li>
                <li><strong>Reset Time:</strong> {{ resetTime }}</li>
              </ul>
            </div>

            <div class="alert alert-warning">
              <h6>Tips to Avoid Rate Limits</h6>
              <ul class="mb-0">
                <li>Use pagination for large object lists</li>
                <li>Implement client-side caching</li>
                <li>Bundle multiple operations when possible</li>
                <li>Use exponential backoff for retries</li>
              </ul>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeDetails()">Close</button>
            <button type="button" class="btn btn-primary" (click)="learnMore()">Learn More</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .rate-limit-status {
      margin-bottom: 1rem;
    }
    
    .status-icon {
      width: 24px;
      height: 24px;
    }
    
    .progress {
      background-color: rgba(0, 0, 0, 0.1);
    }
    
    .progress-bar {
      transition: width 0.3s ease, background-color 0.3s ease;
    }
  `]
})
export class RateLimitStatusComponent implements OnInit, OnDestroy {
  @Input() rateLimitInfo: RateLimitInfo | null = null;
  
  percentageUsed: number = 0;
  warningLevel: 'normal' | 'warning' | 'critical' = 'normal';
  timeUntilReset: string = '';
  resetTime: string = '';
  
  showDetailsModal: boolean = false;
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    // Update countdown every second
    interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateCalculations();
      });
    
    this.updateCalculations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateCalculations(): void {
    if (!this.rateLimitInfo) {
      this.warningLevel = 'normal';
      this.timeUntilReset = '';
      return;
    }

    const used = this.rateLimitInfo.limit - this.rateLimitInfo.remaining;
    this.percentageUsed = Math.round((used / this.rateLimitInfo.limit) * 100);

    // Determine warning level
    if (this.percentageUsed >= 80) {
      this.warningLevel = 'critical';
    } else if (this.percentageUsed >= 50) {
      this.warningLevel = 'warning';
    } else {
      this.warningLevel = 'normal';
    }

    // Calculate time until reset
    const resetSeconds = this.rateLimitInfo.reset;
    if (resetSeconds > 0) {
      const minutes = Math.floor(resetSeconds / 60);
      const seconds = resetSeconds % 60;
      this.timeUntilReset = `Resets in ${minutes}m ${seconds}s`;
      
      const resetDate = new Date(Date.now() + (resetSeconds * 1000));
      this.resetTime = resetDate.toLocaleTimeString();
    } else {
      this.timeUntilReset = 'Resets soon';
      this.resetTime = 'Unknown';
    }
  }

  refreshLimits(): void {
    // This would typically trigger a refresh of rate limit info
    // For now, just recalculate with existing data
    this.updateCalculations();
  }

  showDetails(): void {
    this.showDetailsModal = true;
  }

  closeDetails(): void {
    this.showDetailsModal = false;
  }

  learnMore(): void {
    window.open('https://docs.ai-powered-file-storage.com/rate-limits', '_blank');
  }
}
