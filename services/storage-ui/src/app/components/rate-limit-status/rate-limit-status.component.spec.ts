import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RateLimitStatusComponent } from './rate-limit-status.component';
import { RateLimitInfo } from '../../services/storage.service';

describe('RateLimitStatusComponent', () => {
  let component: RateLimitStatusComponent;
  let fixture: ComponentFixture<RateLimitStatusComponent>;

  const mockRateLimitInfo: RateLimitInfo = {
    limit: 1000,
    remaining: 850,
    reset: 300
  };

  const mockCriticalRateLimitInfo: RateLimitInfo = {
    limit: 1000,
    remaining: 100,
    reset: 150
  };

  const mockWarningRateLimitInfo: RateLimitInfo = {
    limit: 1000,
    remaining: 400,
    reset: 200
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RateLimitStatusComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(RateLimitStatusComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with default values', () => {
      expect(component.percentageUsed).toBe(0);
      expect(component.warningLevel).toBe('normal');
      expect(component.timeUntilReset).toBe('');
      expect(component.resetTime).toBe('');
      expect(component.showDetailsModal).toBe(false);
    });
  });

  describe('Rate Limit Calculations', () => {
    it('should calculate normal usage level', () => {
      component.rateLimitInfo = mockRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(15); // (1000-850)/1000 * 100
      expect(component.warningLevel).toBe('normal');
    });

    it('should calculate warning usage level', () => {
      component.rateLimitInfo = mockWarningRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(60); // (1000-400)/1000 * 100
      expect(component.warningLevel).toBe('warning');
    });

    it('should calculate critical usage level', () => {
      component.rateLimitInfo = mockCriticalRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(90); // (1000-100)/1000 * 100
      expect(component.warningLevel).toBe('critical');
    });

    it('should handle zero rate limit info', () => {
      component.rateLimitInfo = null;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('normal');
      expect(component.timeUntilReset).toBe('');
    });

    it('should handle zero remaining requests', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 0,
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(100);
      expect(component.warningLevel).toBe('critical');
    });

    it('should handle zero limit', () => {
      component.rateLimitInfo = {
        limit: 0,
        remaining: 0,
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(0);
      expect(component.warningLevel).toBe('normal');
    });
  });

  describe('Time Calculations', () => {
    beforeEach(() => {
      jasmine.clock().install();
      const mockDate = new Date('2024-01-01T12:00:00Z');
      jasmine.clock().mockDate(mockDate);
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should calculate time until reset correctly', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 500,
        reset: 300 // 5 minutes
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.timeUntilReset).toBe('Resets in 5m 0s');
    });

    it('should calculate time until reset with seconds only', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 500,
        reset: 45 // 45 seconds
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.timeUntilReset).toBe('Resets in 0m 45s');
    });

    it('should calculate reset time correctly', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 500,
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.resetTime).toContain('12:05:00');
    });

    it('should handle zero reset time', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 500,
        reset: 0
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.timeUntilReset).toBe('Resets soon');
      expect(component.resetTime).toBe('Unknown');
    });
  });

  describe('User Actions', () => {
    beforeEach(() => {
      component.rateLimitInfo = mockRateLimitInfo;
      fixture.detectChanges();
    });

    it('should refresh limits', () => {
      spyOn(component, 'updateCalculations');
      
      component.refreshLimits();
      
      expect(component.updateCalculations).toHaveBeenCalled();
    });

    it('should show details modal', () => {
      component.showDetails();
      
      expect(component.showDetailsModal).toBe(true);
    });

    it('should close details modal', () => {
      component.showDetailsModal = true;
      
      component.closeDetails();
      
      expect(component.showDetailsModal).toBe(false);
    });

    it('should open learn more link', () => {
      spyOn(window, 'open');
      
      component.learnMore();
      
      expect(window.open).toHaveBeenCalledWith(
        'https://docs.ai-powered-file-storage.com/rate-limits',
        '_blank'
      );
    });
  });

  describe('Template Logic', () => {
    it('should show correct status for normal usage', () => {
      component.rateLimitInfo = mockRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('normal');
      expect(component.percentageUsed).toBe(15);
    });

    it('should show correct status for warning usage', () => {
      component.rateLimitInfo = mockWarningRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('warning');
      expect(component.percentageUsed).toBe(60);
    });

    it('should show correct status for critical usage', () => {
      component.rateLimitInfo = mockCriticalRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('critical');
      expect(component.percentageUsed).toBe(90);
    });

    it('should display correct remaining requests', () => {
      component.rateLimitInfo = mockRateLimitInfo;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.rateLimitInfo?.remaining).toBe(850);
      expect(component.rateLimitInfo?.limit).toBe(1000);
    });

    it('should handle null rate limit info gracefully', () => {
      component.rateLimitInfo = null;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('normal');
      expect(component.timeUntilReset).toBe('');
    });
  });

  describe('Progress Bar Calculation', () => {
    it('should calculate exact percentage for various values', () => {
      const testCases = [
        { limit: 1000, remaining: 1000, expected: 0 },
        { limit: 1000, remaining: 750, expected: 25 },
        { limit: 1000, remaining: 500, expected: 50 },
        { limit: 1000, remaining: 250, expected: 75 },
        { limit: 1000, remaining: 0, expected: 100 }
      ];

      testCases.forEach(testCase => {
        component.rateLimitInfo = {
          limit: testCase.limit,
          remaining: testCase.remaining,
          reset: 300
        };
        component.ngOnInit();
        fixture.detectChanges();

        expect(component.percentageUsed).toBe(testCase.expected);
      });
    });

    it('should round percentage correctly', () => {
      component.rateLimitInfo = {
        limit: 3,
        remaining: 2,
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(33); // (3-2)/3 * 100 = 33.33 rounded
    });
  });

  describe('Warning Level Boundaries', () => {
    it('should be normal below 50%', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 501, // 49.9% used
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('normal');
    });

    it('should be warning at 50%', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 500, // 50% used
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('warning');
    });

    it('should be warning below 80%', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 201, // 79.9% used
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('warning');
    });

    it('should be critical at 80%', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 200, // 80% used
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('critical');
    });

    it('should be critical above 80%', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 199, // 80.1% used
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.warningLevel).toBe('critical');
    });
  });

  describe('Component Destruction', () => {
    it('should clean up interval on destroy', () => {
      component.ngOnInit();
      fixture.detectChanges();

      // Verify component was initialized
      expect(component).toBeTruthy();

      // Destroy should not throw errors
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative remaining requests', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: -1,
        reset: 300
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(101); // (1000-(-1))/1000 * 100
      expect(component.warningLevel).toBe('critical');
    });

    it('should handle negative reset time', () => {
      component.rateLimitInfo = {
        limit: 1000,
        remaining: 500,
        reset: -1
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.timeUntilReset).toBe('Resets soon');
    });

    it('should handle very large numbers', () => {
      component.rateLimitInfo = {
        limit: 1000000,
        remaining: 999000,
        reset: 3600
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.percentageUsed).toBe(0); // (1000000-999000)/1000000 * 100 = 0.1 rounded
      expect(component.warningLevel).toBe('normal');
    });
  });
});
