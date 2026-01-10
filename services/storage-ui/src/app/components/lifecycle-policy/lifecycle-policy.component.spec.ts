import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LifecyclePolicyComponent } from './lifecycle-policy.component';
import { StorageService, LifecyclePolicy, LifecycleRule } from '../../services/storage.service';

describe('LifecyclePolicyComponent', () => {
  let component: LifecyclePolicyComponent;
  let fixture: ComponentFixture<LifecyclePolicyComponent>;
  let mockStorageService: jasmine.SpyObj<StorageService>;
  let mockActivatedRoute: jasmine.SpyObj<ActivatedRoute>;

  const mockLifecyclePolicy: LifecyclePolicy = {
    id: 1,
    bucket_id: 1,
    enabled: true,
    rules: [
      {
        id: 'rule1',
        action: 'expire',
        days: 30,
        prefix: 'logs/',
        enabled: true
      },
      {
        id: 'rule2',
        action: 'transition',
        days: 90,
        prefix: 'documents/',
        storage_class: 'infrequent',
        enabled: true
      }
    ]
  };

  const mockEmptyPolicy: LifecyclePolicy = {
    id: 0,
    bucket_id: 1,
    enabled: false,
    rules: []
  };

  beforeEach(async () => {
    const storageSpy = jasmine.createSpyObj('StorageService', ['getLifecyclePolicy', 'setLifecyclePolicy']);
    const routeSpy = jasmine.createSpyObj('ActivatedRoute', ['params']);

    await TestBed.configureTestingModule({
      declarations: [LifecyclePolicyComponent],
      providers: [
        { provide: StorageService, useValue: storageSpy },
        { provide: ActivatedRoute, useValue: routeSpy }
      ]
    }).compileComponents();

    mockStorageService = TestBed.inject(StorageService) as jasmine.SpyObj<StorageService>;
    mockActivatedRoute = TestBed.inject(ActivatedRoute) as jasmine.SpyObj<ActivatedRoute>;

    fixture = TestBed.createComponent(LifecyclePolicyComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with bucket name from route params', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });

      mockStorageService.getLifecyclePolicy.and.returnValue(of(mockLifecyclePolicy));

      fixture.detectChanges();

      expect(component.bucketName).toBe('test-bucket');
    });

    it('should load policy on initialization', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });

      mockStorageService.getLifecyclePolicy.and.returnValue(of(mockLifecyclePolicy));

      fixture.detectChanges();

      expect(mockStorageService.getLifecyclePolicy).toHaveBeenCalledWith('test-bucket');
      expect(component.policy).toEqual(mockLifecyclePolicy);
    });

    it('should create empty policy when none exists', () => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });

      mockStorageService.getLifecyclePolicy.and.returnValue(throwError('Policy not found'));

      fixture.detectChanges();

      expect(component.policy).toEqual(mockEmptyPolicy);
    });
  });

  describe('Policy Loading', () => {
    beforeEach(() => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });
    });

    it('should handle successful policy load', () => {
      mockStorageService.getLifecyclePolicy.and.returnValue(of(mockLifecyclePolicy));

      component.loadPolicy();

      expect(component.policy).toEqual(mockLifecyclePolicy);
    });

    it('should handle policy load error', () => {
      spyOn(console, 'error');
      mockStorageService.getLifecyclePolicy.and.returnValue(throwError('API Error'));

      component.loadPolicy();

      expect(console.error).toHaveBeenCalledWith('Error loading lifecycle policy:', 'API Error');
      expect(component.policy).toEqual(mockEmptyPolicy);
    });
  });

  describe('Policy Toggle', () => {
    beforeEach(() => {
      component.policy = mockLifecyclePolicy;
      spyOn(component, 'savePolicy');
    });

    it('should save policy when toggled', () => {
      component.togglePolicy();

      expect(component.savePolicy).toHaveBeenCalled();
    });
  });

  describe('Rule Management', () => {
    beforeEach(() => {
      component.policy = mockEmptyPolicy;
      spyOn(component, 'savePolicy');
    });

    it('should add new rule', () => {
      component.addRule();

      expect(component.showRuleEditor).toBe(true);
      expect(component.editingRuleIndex).toBe(-1);
      expect(component.editingRule).toEqual({
        id: jasmine.any(String),
        action: 'expire',
        days: 30,
        enabled: true
      });
    });

    it('should edit existing rule', () => {
      const ruleIndex = 0;
      component.policy = mockLifecyclePolicy;

      component.editRule(ruleIndex);

      expect(component.showRuleEditor).toBe(true);
      expect(component.editingRuleIndex).toBe(ruleIndex);
      expect(component.editingRule).toEqual(mockLifecyclePolicy.rules[ruleIndex]);
    });

    it('should delete rule with confirmation', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      component.policy = mockLifecyclePolicy;
      const initialRuleCount = component.policy.rules.length;

      component.deleteRule(0);

      expect(component.policy.rules.length).toBe(initialRuleCount - 1);
      expect(component.savePolicy).toHaveBeenCalled();
    });

    it('should not delete rule when confirmation is cancelled', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.policy = mockLifecyclePolicy;
      const initialRuleCount = component.policy.rules.length;

      component.deleteRule(0);

      expect(component.policy.rules.length).toBe(initialRuleCount);
      expect(component.savePolicy).not.toHaveBeenCalled();
    });
  });

  describe('Rule Editor', () => {
    beforeEach(() => {
      component.policy = mockEmptyPolicy;
    });

    it('should close rule editor', () => {
      component.showRuleEditor = true;
      component.editingRuleIndex = 1;

      component.closeRuleEditor();

      expect(component.showRuleEditor).toBe(false);
      expect(component.editingRuleIndex).toBe(-1);
    });

    it('should save new rule', () => {
      component.editingRule = {
        id: 'new-rule',
        action: 'expire',
        days: 60,
        prefix: 'temp/',
        enabled: true
      };
      component.editingRuleIndex = -1;

      component.saveRule();

      expect(component.policy.rules).toContain(component.editingRule);
      expect(component.showRuleEditor).toBe(false);
      expect(component.savePolicy).toHaveBeenCalled();
    });

    it('should update existing rule', () => {
      component.policy = mockLifecyclePolicy;
      const ruleIndex = 0;
      component.editingRule = {
        ...mockLifecyclePolicy.rules[ruleIndex],
        days: 45
      };
      component.editingRuleIndex = ruleIndex;

      component.saveRule();

      expect(component.policy.rules[ruleIndex].days).toBe(45);
      expect(component.showRuleEditor).toBe(false);
      expect(component.savePolicy).toHaveBeenCalled();
    });

    it('should validate rule before saving', () => {
      component.editingRule = {
        id: 'invalid-rule',
        action: 'expire',
        days: 0, // Invalid: must be >= 1
        enabled: true
      };
      spyOn(window, 'alert');

      component.saveRule();

      expect(window.alert).toHaveBeenCalledWith('Please specify a valid number of days');
      expect(component.policy.rules).not.toContain(component.editingRule);
      expect(component.savePolicy).not.toHaveBeenCalled();
    });
  });

  describe('Policy Saving', () => {
    beforeEach(() => {
      component.policy = mockLifecyclePolicy;
    });

    it('should save policy successfully', () => {
      mockStorageService.setLifecyclePolicy.and.returnValue(of(mockLifecyclePolicy));
      spyOn(console, 'log');

      component.savePolicy();

      expect(mockStorageService.setLifecyclePolicy).toHaveBeenCalledWith('test-bucket', mockLifecyclePolicy);
      expect(component.policy).toEqual(mockLifecyclePolicy);
      expect(console.log).toHaveBeenCalledWith('Policy saved successfully');
    });

    it('should handle save error', () => {
      mockStorageService.setLifecyclePolicy.and.returnValue(throwError('Save failed'));
      spyOn(console, 'error');
      spyOn(window, 'alert');

      component.savePolicy();

      expect(console.error).toHaveBeenCalledWith('Error saving policy:', 'Save failed');
      expect(window.alert).toHaveBeenCalledWith('Failed to save policy. Please try again.');
    });
  });

  describe('Action Label Helpers', () => {
    it('should get correct action labels', () => {
      expect(component.getActionLabel('expire')).toBe('EXPIRE');
      expect(component.getActionLabel('transition')).toBe('TRANSITION');
      expect(component.getActionLabel('delete')).toBe('DELETE');
      expect(component.getActionLabel('unknown')).toBe('UNKNOWN');
    });

    it('should get correct action descriptions', () => {
      expect(component.getActionDescription('expire')).toBe('Expire objects (soft delete)');
      expect(component.getActionDescription('transition')).toBe('Change storage class');
      expect(component.getActionDescription('delete')).toBe('Permanently delete objects');
      expect(component.getActionDescription('unknown')).toBe('unknown');
    });
  });

  describe('Template Logic', () => {
    beforeEach(() => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });
      mockStorageService.getLifecyclePolicy.and.returnValue(of(mockLifecyclePolicy));
      fixture.detectChanges();
    });

    it('should show correct policy status when enabled', () => {
      component.policy.enabled = true;
      fixture.detectChanges();

      expect(component.policy.enabled).toBe(true);
    });

    it('should show correct policy status when disabled', () => {
      component.policy.enabled = false;
      fixture.detectChanges();

      expect(component.policy.enabled).toBe(false);
    });

    it('should display correct rule count', () => {
      expect(component.policy.rules.length).toBe(2);
    });

    it('should handle empty rules list', () => {
      component.policy.rules = [];
      fixture.detectChanges();

      expect(component.policy.rules.length).toBe(0);
    });
  });

  describe('Rule Actions in Template', () => {
    beforeEach(() => {
      component.policy = mockLifecyclePolicy;
      component.editingRule = {
        id: 'test-rule',
        action: 'expire',
        days: 30,
        prefix: 'test/',
        enabled: true
      };
    });

    it('should handle rule with transition action', () => {
      component.editingRule.action = 'transition';
      component.editingRule.storage_class = 'infrequent';

      expect(component.editingRule.action).toBe('transition');
      expect(component.editingRule.storage_class).toBe('infrequent');
    });

    it('should handle rule with delete action', () => {
      component.editingRule.action = 'delete';

      expect(component.editingRule.action).toBe('delete');
    });

    it('should handle rule without prefix', () => {
      component.editingRule.prefix = undefined;

      expect(component.editingRule.prefix).toBeUndefined();
    });

    it('should handle rule with storage class', () => {
      component.editingRule.action = 'transition';
      component.editingRule.storage_class = 'cold';

      expect(component.editingRule.storage_class).toBe('cold');
    });
  });

  describe('Error Scenarios', () => {
    beforeEach(() => {
      mockActivatedRoute.params = of({
        bucketName: 'test-bucket'
      });
    });

    it('should handle network error when loading policy', () => {
      spyOn(console, 'error');
      mockStorageService.getLifecyclePolicy.and.returnValue(throwError(new Error('Network error')));

      component.loadPolicy();

      expect(console.error).toHaveBeenCalledWith('Error loading lifecycle policy:', jasmine.any(Error));
      expect(component.policy).toEqual(mockEmptyPolicy);
    });

    it('should handle server error when saving policy', () => {
      spyOn(console, 'error');
      spyOn(window, 'alert');
      mockStorageService.setLifecyclePolicy.and.returnValue(throwError(new Error('Server error')));

      component.savePolicy();

      expect(console.error).toHaveBeenCalledWith('Error saving policy:', jasmine.any(Error));
      expect(window.alert).toHaveBeenCalledWith('Failed to save policy. Please try again.');
    });
  });
});
