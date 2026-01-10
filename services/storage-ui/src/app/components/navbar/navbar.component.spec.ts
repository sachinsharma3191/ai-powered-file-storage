import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [NavbarComponent],
      providers: [
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Navigation', () => {
    it('should navigate to buckets', () => {
      component.navigateToBuckets();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/buckets']);
    });

    it('should navigate to profile', () => {
      component.navigateToProfile();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/profile']);
    });

    it('should navigate to settings', () => {
      component.navigateToSettings();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/settings']);
    });

    it('should navigate to setup', () => {
      component.navigateToSetup();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/setup']);
    });

    it('should navigate to admin login', () => {
      component.navigateToAdminLogin();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin-login']);
    });
  });

  describe('User Actions', () => {
    it('should handle logout', () => {
      spyOn(localStorage, 'removeItem');
      spyOn(component, 'navigateToSetup');

      component.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('user_profile');
      expect(component.navigateToSetup).toHaveBeenCalled();
    });
  });

  describe('Template Logic', () => {
    it('should display correct title', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const titleElement = compiled.querySelector('.navbar-brand') || compiled.querySelector('h1');
      expect(titleElement?.textContent).toContain('AI Powered File Storage');
    });

    it('should have navigation links', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const navLinks = compiled.querySelectorAll('a[routerLink]');
      
      expect(navLinks.length).toBeGreaterThan(0);
    });
  });

  describe('Component State', () => {
    it('should initialize correctly', () => {
      expect(component).toBeTruthy();
    });

    it('should handle navigation without errors', () => {
      expect(() => {
        component.navigateToBuckets();
        component.navigateToProfile();
        component.navigateToSettings();
        component.navigateToSetup();
        component.navigateToAdminLogin();
      }).not.toThrow();
    });

    it('should handle logout without errors', () => {
      spyOn(localStorage, 'removeItem');
      spyOn(component, 'navigateToSetup');

      expect(() => component.logout()).not.toThrow();
    });
  });

  describe('Router Integration', () => {
    it('should call router navigate with correct parameters', () => {
      const testCases = [
        { method: 'navigateToBuckets', expectedRoute: ['/buckets'] },
        { method: 'navigateToProfile', expectedRoute: ['/profile'] },
        { method: 'navigateToSettings', expectedRoute: ['/settings'] },
        { method: 'navigateToSetup', expectedRoute: ['/setup'] },
        { method: 'navigateToAdminLogin', expectedRoute: ['/admin-login'] }
      ];

      testCases.forEach(testCase => {
        mockRouter.navigate.calls.reset();
        (component as any)[testCase.method]();
        expect(mockRouter.navigate).toHaveBeenCalledWith(testCase.expectedRoute);
      });
    });
  });

  describe('LocalStorage Integration', () => {
    it('should remove auth token on logout', () => {
      spyOn(localStorage, 'removeItem');
      spyOn(component, 'navigateToSetup');

      component.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });

    it('should remove user profile on logout', () => {
      spyOn(localStorage, 'removeItem');
      spyOn(component, 'navigateToSetup');

      component.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('user_profile');
    });
  });

  describe('Error Handling', () => {
    it('should handle router navigation errors gracefully', () => {
      mockRouter.navigate.and.returnValue(Promise.reject('Navigation failed'));

      expect(() => component.navigateToBuckets()).not.toThrow();
    });

    it('should handle localStorage errors gracefully', () => {
      spyOn(localStorage, 'removeItem').and.throwError('Storage error');

      expect(() => component.logout()).not.toThrow();
    });
  });
});
