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

  describe('User Actions', () => {
    it('should handle logout', () => {
      spyOn(localStorage, 'removeItem');

      component.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('user_profile');
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

    it('should handle logout without errors', () => {
      spyOn(localStorage, 'removeItem');

      expect(() => component.logout()).not.toThrow();
    });
  });

  describe('Router Integration', () => {
    // Router integration tests would require actual navigation methods
    // For now, we test that the component can be instantiated
    it('should be able to instantiate with router', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('LocalStorage Integration', () => {
    it('should remove auth token on logout', () => {
      spyOn(localStorage, 'removeItem');

      component.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
    });

    it('should remove user profile on logout', () => {
      spyOn(localStorage, 'removeItem');

      component.logout();

      expect(localStorage.removeItem).toHaveBeenCalledWith('user_profile');
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      spyOn(localStorage, 'removeItem').and.throwError('Storage error');

      expect(() => component.logout()).not.toThrow();
    });
  });
});
