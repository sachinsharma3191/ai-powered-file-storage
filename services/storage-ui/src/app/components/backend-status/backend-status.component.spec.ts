import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';

import { BackendStatusComponent } from './backend-status.component';
import { BackendIntegrationService, BackendHealth, ServiceStatus } from '../../services/backend-integration.service';

describe('BackendStatusComponent', () => {
  let component: BackendStatusComponent;
  let fixture: ComponentFixture<BackendStatusComponent>;
  let mockBackendService: jasmine.SpyObj<BackendIntegrationService>;

  const mockServiceStatus: ServiceStatus[] = [
    {
      name: 'S3 Service',
      status: 'healthy',
      response_time: 45,
      last_check: '2024-01-01T00:00:00Z',
      error: null
    },
    {
      name: 'Database',
      status: 'healthy',
      response_time: 12,
      last_check: '2024-01-01T00:00:00Z',
      error: null
    },
    {
      name: 'Redis Cache',
      status: 'degraded',
      response_time: 150,
      last_check: '2024-01-01T00:00:00Z',
      error: 'High latency'
    },
    {
      name: 'Chunk Gateway',
      status: 'unhealthy',
      response_time: null,
      last_check: '2024-01-01T00:00:00Z',
      error: 'Connection timeout'
    }
  ];

  const mockBackendHealth: BackendHealth = {
    overall_status: 'degraded',
    services: mockServiceStatus,
    uptime: 86400,
    version: '1.0.0',
    environment: 'production'
  };

  beforeEach(async () => {
    const backendServiceSpy = jasmine.createSpyObj('BackendIntegrationService', [
      'getHealthStatus',
      'getServiceStatus',
      'checkHealth'
    ]);

    backendServiceSpy.getHealthStatus.and.returnValue(of(mockBackendHealth));
    backendServiceSpy.getServiceStatus.and.returnValue(of(mockServiceStatus));
    backendServiceSpy.checkHealth.and.returnValue(of({ status: 'ok' }));

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        BackendStatusComponent
      ],
      providers: [
        { provide: BackendIntegrationService, useValue: backendServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BackendStatusComponent);
    component = fixture.componentInstance;
    mockBackendService = TestBed.inject(BackendIntegrationService) as jasmine.SpyObj<BackendIntegrationService>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should load health status on ngOnInit', waitForAsync(() => {
      component.ngOnInit();
      
      fixture.whenStable().then(() => {
        expect(mockBackendService.getHealthStatus).toHaveBeenCalled();
        expect(component.healthStatus).toEqual(mockBackendHealth);
        expect(component.services).toEqual(mockServiceStatus);
        expect(component.isLoading).toBeFalse();
      });
    }));

    it('should set up refresh interval on ngOnInit', () => {
      spyOn(window, 'setInterval');
      spyOn(component, 'refreshStatus');
      
      component.ngOnInit();
      
      expect(window.setInterval).toHaveBeenCalled();
    });

    it('should clear interval on ngOnDestroy', () => {
      spyOn(window, 'clearInterval');
      component.refreshInterval = 123;
      
      component.ngOnDestroy();
      
      expect(window.clearInterval).toHaveBeenCalledWith(123);
    });
  });

  describe('Health Status Loading', () => {
    it('should handle loading state correctly', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const loadingElement = fixture.debugElement.query(By.css('.loading'));
      expect(loadingElement).toBeTruthy();
    });

    it('should handle error when loading health status', waitForAsync(() => {
      mockBackendService.getHealthStatus.and.returnValue(throwError(() => new Error('Failed to load')));
      spyOn(console, 'error');
      
      component.ngOnInit();
      
      fixture.whenStable().then(() => {
        expect(component.isLoading).toBeFalse();
        expect(component.error).toBe('Failed to load backend status');
        expect(console.error).toHaveBeenCalledWith('Error loading backend status:', jasmine.any(Error));
      });
    }));

    it('should retry loading on error', waitForAsync(() => {
      mockBackendService.getHealthStatus.and.returnValues(
        throwError(() => new Error('First error')),
        of(mockBackendHealth)
      );
      
      component.ngOnInit();
      component.retryLoading();
      
      fixture.whenStable().then(() => {
        expect(mockBackendService.getHealthStatus).toHaveBeenCalledTimes(2);
        expect(component.error).toBeNull();
      });
    }));
  });

  describe('Status Calculation', () => {
    beforeEach(() => {
      component.services = mockServiceStatus;
    });

    it('should return healthy status when all services are healthy', () => {
      const allHealthyServices = mockServiceStatus.map(s => ({ ...s, status: 'healthy' }));
      component.services = allHealthyServices;
      
      expect(component.getOverallStatus()).toBe('healthy');
    });

    it('should return degraded status when some services are degraded', () => {
      expect(component.getOverallStatus()).toBe('degraded');
    });

    it('should return unhealthy status when any service is unhealthy', () => {
      const unhealthyServices = [...mockServiceStatus, {
        name: 'New Service',
        status: 'unhealthy',
        response_time: null,
        last_check: '2024-01-01T00:00:00Z',
        error: 'Failed'
      } as ServiceStatus];
      component.services = unhealthyServices;
      
      expect(component.getOverallStatus()).toBe('unhealthy');
    });

    it('should return unknown status when no services', () => {
      component.services = [];
      
      expect(component.getOverallStatus()).toBe('unknown');
    });
  });

  describe('Status Display Helpers', () => {
    it('should return correct status icon for healthy', () => {
      expect(component.getOverallStatusIcon()).toBe('✅');
    });

    it('should return correct status icon for degraded', () => {
      component.services = mockServiceStatus;
      expect(component.getOverallStatusIcon()).toBe('⚠️');
    });

    it('should return correct status icon for unhealthy', () => {
      component.services = [{ ...mockServiceStatus[0], status: 'unhealthy' }];
      expect(component.getOverallStatusIcon()).toBe('❌');
    });

    it('should return correct status text', () => {
      component.services = mockServiceStatus;
      expect(component.getOverallStatusText()).toBe('Degraded Performance');
    });

    it('should return correct status class', () => {
      component.services = mockServiceStatus;
      expect(component.getOverallStatusClass()).toBe('degraded');
    });
  });

  describe('Service Status Helpers', () => {
    it('should return correct service status icon', () => {
      expect(component.getServiceStatusIcon('healthy')).toBe('✅');
      expect(component.getServiceStatusIcon('degraded')).toBe('⚠️');
      expect(component.getServiceStatusIcon('unhealthy')).toBe('❌');
      expect(component.getServiceStatusIcon('unknown')).toBe('❓');
    });

    it('should return correct service status class', () => {
      expect(component.getServiceStatusClass('healthy')).toBe('status-healthy');
      expect(component.getServiceStatusClass('degraded')).toBe('status-degraded');
      expect(component.getServiceStatusClass('unhealthy')).toBe('status-unhealthy');
      expect(component.getServiceStatusClass('unknown')).toBe('status-unknown');
    });

    it('should format response time correctly', () => {
      expect(component.formatResponseTime(45)).toBe('45ms');
      expect(component.formatResponseTime(1500)).toBe('1.5s');
      expect(component.formatResponseTime(null)).toBe('N/A');
    });

    it('should format last check time correctly', () => {
      const date = '2024-01-01T00:00:00Z';
      const result = component.formatLastCheck(date);
      
      expect(result).toContain('2024');
    });

    it('should check if service is healthy', () => {
      expect(component.isServiceHealthy({ status: 'healthy' } as ServiceStatus)).toBeTrue();
      expect(component.isServiceHealthy({ status: 'degraded' } as ServiceStatus)).toBeFalse();
      expect(component.isServiceHealthy({ status: 'unhealthy' } as ServiceStatus)).toBeFalse();
    });
  });

  describe('Refresh Functionality', () => {
    it('should refresh status manually', waitForAsync(() => {
      mockBackendService.getHealthStatus.calls.reset();
      
      component.refreshStatus();
      
      fixture.whenStable().then(() => {
        expect(mockBackendService.getHealthStatus).toHaveBeenCalled();
      });
    }));

    it('should handle refresh errors', waitForAsync(() => {
      mockBackendService.getHealthStatus.and.returnValue(throwError(() => new Error('Refresh failed')));
      spyOn(console, 'error');
      
      component.refreshStatus();
      
      fixture.whenStable().then(() => {
        expect(console.error).toHaveBeenCalledWith('Error refreshing backend status:', jasmine.any(Error));
      });
    }));

    it('should toggle auto refresh', () => {
      expect(component.autoRefresh).toBeTrue();
      
      component.toggleAutoRefresh();
      expect(component.autoRefresh).toBeFalse();
      
      component.toggleAutoRefresh();
      expect(component.autoRefresh).toBeTrue();
    });
  });

  describe('Service Details', () => {
    it('should show service details when expanded', () => {
      component.expandedServices = ['S3 Service'];
      fixture.detectChanges();
      
      const serviceDetails = fixture.debugElement.query(By.css('.service-details'));
      expect(serviceDetails).toBeTruthy();
    });

    it('should toggle service expansion', () => {
      const serviceName = 'S3 Service';
      
      component.toggleServiceDetails(serviceName);
      expect(component.expandedServices).toContain(serviceName);
      
      component.toggleServiceDetails(serviceName);
      expect(component.expandedServices).not.toContain(serviceName);
    });

    it('should get service health percentage', () => {
      expect(component.getHealthPercentage()).toBe(50); // 2 out of 4 services healthy
    });

    it('should get service count by status', () => {
      expect(component.getServiceCountByStatus('healthy')).toBe(2);
      expect(component.getServiceCountByStatus('degraded')).toBe(1);
      expect(component.getServiceCountByStatus('unhealthy')).toBe(1);
    });
  });

  describe('Template Rendering', () => {
    beforeEach(() => {
      component.healthStatus = mockBackendHealth;
      component.services = mockServiceStatus;
      component.isLoading = false;
      fixture.detectChanges();
    });

    it('should render overall status', () => {
      const overallStatus = fixture.debugElement.query(By.css('.overall-status'));
      expect(overallStatus).toBeTruthy();
      expect(overallStatus.nativeElement.textContent).toContain('Degraded Performance');
    });

    it('should render service list', () => {
      const serviceItems = fixture.debugElement.queryAll(By.css('.service-item'));
      expect(serviceItems.length).toBe(4);
    });

    it('should render service status icons', () => {
      const statusIcons = fixture.debugElement.queryAll(By.css('.status-icon'));
      expect(statusIcons.length).toBe(4);
    });

    it('should render response times', () => {
      const responseTimes = fixture.debugElement.queryAll(By.css('.response-time'));
      expect(responseTimes.length).toBe(4);
    });

    it('should show error messages for unhealthy services', () => {
      const errorMessages = fixture.debugElement.queryAll(By.css('.error-message'));
      expect(errorMessages.length).toBe(2); // degraded + unhealthy
    });

    it('should render refresh button', () => {
      const refreshButton = fixture.debugElement.query(By.css('.refresh-button'));
      expect(refreshButton).toBeTruthy();
    });

    it('should render auto refresh toggle', () => {
      const autoRefreshToggle = fixture.debugElement.query(By.css('.auto-refresh-toggle'));
      expect(autoRefreshToggle).toBeTruthy();
    });

    it('should show loading state', () => {
      component.isLoading = true;
      fixture.detectChanges();
      
      const loading = fixture.debugElement.query(By.css('.loading'));
      expect(loading).toBeTruthy();
    });

    it('should show error state', () => {
      component.error = 'Test error';
      fixture.detectChanges();
      
      const errorState = fixture.debugElement.query(By.css('.error-state'));
      expect(errorState).toBeTruthy();
      expect(errorState.nativeElement.textContent).toContain('Test error');
    });

    it('should render service details when expanded', () => {
      component.expandedServices = ['S3 Service'];
      fixture.detectChanges();
      
      const detailsPanel = fixture.debugElement.query(By.css('.service-details'));
      expect(detailsPanel).toBeTruthy();
    });

    it('should render health statistics', () => {
      const healthStats = fixture.debugElement.query(By.css('.health-stats'));
      expect(healthStats).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should handle null service status gracefully', () => {
      component.services = null;
      
      expect(component.getOverallStatus()).toBe('unknown');
      expect(component.getHealthPercentage()).toBe(0);
    });

    it('should handle service with null response time', () => {
      const serviceWithNullTime = { ...mockServiceStatus[0], response_time: null };
      
      expect(component.formatResponseTime(serviceWithNullTime.response_time)).toBe('N/A');
    });

    it('should handle service with null error', () => {
      const serviceWithNullError = { ...mockServiceStatus[0], error: null };
      
      expect(component.getServiceError(serviceWithNullError)).toBe('');
    });
  });

  describe('Component Interactions', () => {
    beforeEach(() => {
      component.healthStatus = mockBackendHealth;
      component.services = mockServiceStatus;
      fixture.detectChanges();
    });

    it('should call refreshStatus when refresh button clicked', () => {
      spyOn(component, 'refreshStatus');
      
      const refreshButton = fixture.debugElement.query(By.css('.refresh-button'));
      refreshButton.triggerEventHandler('click', null);
      
      expect(component.refreshStatus).toHaveBeenCalled();
    });

    it('should toggle service details when service clicked', () => {
      const serviceItem = fixture.debugElement.query(By.css('.service-item'));
      serviceItem.triggerEventHandler('click', null);
      
      expect(component.expandedServices.length).toBe(1);
    });

    it('should call toggleAutoRefresh when toggle clicked', () => {
      spyOn(component, 'toggleAutoRefresh');
      
      const toggleButton = fixture.debugElement.query(By.css('.auto-refresh-toggle'));
      toggleButton.triggerEventHandler('click', null);
      
      expect(component.toggleAutoRefresh).toHaveBeenCalled();
    });
  });
});
