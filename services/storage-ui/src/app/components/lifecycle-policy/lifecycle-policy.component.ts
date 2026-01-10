import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StorageService, LifecyclePolicy, LifecycleRule } from '../../services/storage.service';

@Component({
  selector: 'app-lifecycle-policy',
  standalone: true,
  template: `
    <div class="lifecycle-policy">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h4>Lifecycle Policy Management</h4>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" 
                 id="policyEnabled" 
                 [(ngModel)]="policy.enabled"
                 (change)="togglePolicy()">
          <label class="form-check-label" for="policyEnabled">
            Enable Policy
          </label>
        </div>
      </div>

      <!-- Policy Status -->
      <div class="alert" 
           [class.alert-success]="policy.enabled" 
           [class.alert-secondary]="!policy.enabled">
        <div class="d-flex align-items-center">
          <svg class="w-5 h-5 me-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path *ngIf="policy.enabled" d="M22,11.08V12a10,10,0,1,1-5.93-9.14"/>
            <polyline *ngIf="policy.enabled" points="22,4 12,14.01 9,11.01"/>
            <circle *ngIf="!policy.enabled" cx="12" cy="12" r="10"/>
            <line *ngIf="!policy.enabled" x1="12" y1="8" x2="12" y2="12"/>
            <line *ngIf="!policy.enabled" x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div>
            <strong>{{ policy.enabled ? 'Policy Active' : 'Policy Inactive' }}</strong>
            <div class="small">
              {{ policy.enabled ? 'Lifecycle rules are being applied automatically' : 'No lifecycle actions will be executed' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Rules List -->
      <div class="rules-section" *ngIf="policy.enabled">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5>Rules ({{ policy.rules.length }})</h5>
          <button class="btn btn-primary btn-sm" (click)="addRule()">
            <svg class="w-4 h-4 me-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Rule
          </button>
        </div>

        <div class="rules-list" *ngIf="policy.rules.length > 0">
          <div class="card mb-3" *ngFor="let rule of policy.rules; let i = index">
            <div class="card-header d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center">
                <span class="badge bg-primary me-2">{{ getActionLabel(rule.action) }}</span>
                <strong>Rule {{ i + 1 }}</strong>
                <span class="badge bg-secondary ms-2" *ngIf="rule.prefix">{{ rule.prefix }}</span>
              </div>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" (click)="editRule(i)">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11,4H4a2,2,0,0,0-2,2V14a2,2,0,0,0,2,2H14a2,2,0,0,0,2-2V7"/>
                    <path d="M18.5,2.5a2.121,2.121,0,0,1,3,3L12,15l-4,1,1-4Z"/>
                  </svg>
                </button>
                <button class="btn btn-outline-danger" (click)="deleteRule(i)">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3,6 5,6 21,6"/>
                    <path d="M19,6V14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6"/>
                  </svg>
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-6">
                  <div class="mb-2">
                    <strong>Action:</strong> {{ getActionDescription(rule.action) }}
                  </div>
                  <div class="mb-2" *ngIf="rule.prefix">
                    <strong>Prefix:</strong> {{ rule.prefix }}
                  </div>
                  <div class="mb-2">
                    <strong>After:</strong> {{ rule.days }} days
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="mb-2" *ngIf="rule.storage_class">
                    <strong>Storage Class:</strong> {{ rule.storage_class }}
                  </div>
                  <div class="mb-2">
                    <strong>Status:</strong> 
                    <span class="badge" 
                          [class.bg-success]="rule.enabled" 
                          [class.bg-secondary]="!rule.enabled">
                      {{ rule.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="text-center py-5" *ngIf="policy.rules.length === 0">
          <svg class="w-16 h-16 text-muted mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
          </svg>
          <h5 class="text-muted">No Rules Defined</h5>
          <p class="text-muted">Add rules to automatically manage object lifecycle</p>
          <button class="btn btn-primary" (click)="addRule()">Add Your First Rule</button>
        </div>
      </div>

      <!-- Rule Editor Modal -->
      <div class="modal fade" id="ruleModal" tabindex="-1" *ngIf="showRuleEditor">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">{{ editingRuleIndex >= 0 ? 'Edit Rule' : 'Add Rule' }}</h5>
              <button type="button" class="btn-close" (click)="closeRuleEditor()"></button>
            </div>
            <div class="modal-body">
              <form>
                <div class="mb-3">
                  <label class="form-label">Action</label>
                  <select class="form-select" [(ngModel)]="editingRule.action" name="action">
                    <option value="expire">Expire Objects</option>
                    <option value="transition">Change Storage Class</option>
                    <option value="delete">Permanently Delete</option>
                  </select>
                  <div class="form-text">What action to perform on matching objects</div>
                </div>

                <div class="mb-3">
                  <label class="form-label">Object Prefix (Optional)</label>
                  <input type="text" class="form-control" 
                         [(ngModel)]="editingRule.prefix" 
                         name="prefix"
                         placeholder="e.g., logs/, images/">
                  <div class="form-text">Only apply to objects with this prefix</div>
                </div>

                <div class="mb-3">
                  <label class="form-label">Days After Creation</label>
                  <input type="number" class="form-control" 
                         [(ngModel)]="editingRule.days" 
                         name="days"
                         min="1"
                         required>
                  <div class="form-text">Wait this many days before applying the action</div>
                </div>

                <div class="mb-3" *ngIf="editingRule.action === 'transition'">
                  <label class="form-label">Target Storage Class</label>
                  <select class="form-select" [(ngModel)]="editingRule.storage_class" name="storage_class">
                    <option value="standard">Standard</option>
                    <option value="infrequent">Infrequent Access</option>
                    <option value="cold">Cold Storage</option>
                    <option value="archive">Archive</option>
                  </select>
                </div>

                <div class="mb-3">
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" 
                           [(ngModel)]="editingRule.enabled" 
                           name="enabled"
                           id="ruleEnabled">
                    <label class="form-check-label" for="ruleEnabled">
                      Enable this rule
                    </label>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="closeRuleEditor()">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="saveRule()">
                {{ editingRuleIndex >= 0 ? 'Update' : 'Add' }} Rule
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lifecycle-policy {
      padding: 1rem;
    }
    
    .rules-section {
      margin-top: 2rem;
    }
    
    .rules-list .card {
      border-left: 4px solid #007bff;
    }
    
    .badge {
      font-size: 0.75rem;
    }
  `]
})
export class LifecyclePolicyComponent implements OnInit {
  bucketName: string = '';
  policy: LifecyclePolicy = {
    id: 0,
    bucket_id: 0,
    enabled: false,
    rules: []
  };

  showRuleEditor: boolean = false;
  editingRuleIndex: number = -1;
  editingRule: LifecycleRule = {
    id: '',
    action: 'expire',
    days: 30,
    enabled: true
  };

  constructor(
    private route: ActivatedRoute,
    private storageService: StorageService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe((params: any) => {
      this.bucketName = params['bucketName'];
      this.loadPolicy();
    });
  }

  loadPolicy(): void {
    this.storageService.getLifecyclePolicy(this.bucketName).subscribe({
      next: (policy) => {
        this.policy = policy;
      },
      error: (error: any) => {
        console.error('Error loading lifecycle policy:', error);
        // Create empty policy if none exists
        this.policy = {
          id: 0,
          bucket_id: 0,
          enabled: false,
          rules: []
        };
      }
    });
  }

  togglePolicy(): void {
    this.savePolicy();
  }

  addRule(): void {
    this.editingRuleIndex = -1;
    this.editingRule = {
      id: Date.now().toString(),
      action: 'expire',
      days: 30,
      enabled: true
    };
    this.showRuleEditor = true;
  }

  editRule(index: number): void {
    this.editingRuleIndex = index;
    this.editingRule = { ...this.policy.rules[index] };
    this.showRuleEditor = true;
  }

  deleteRule(index: number): void {
    if (confirm('Are you sure you want to delete this rule?')) {
      this.policy.rules.splice(index, 1);
      this.savePolicy();
    }
  }

  saveRule(): void {
    if (!this.editingRule.days || this.editingRule.days < 1) {
      alert('Please specify a valid number of days');
      return;
    }

    if (this.editingRuleIndex >= 0) {
      // Update existing rule
      this.policy.rules[this.editingRuleIndex] = { ...this.editingRule };
    } else {
      // Add new rule
      this.policy.rules.push({ ...this.editingRule });
    }

    this.savePolicy();
    this.closeRuleEditor();
  }

  closeRuleEditor(): void {
    this.showRuleEditor = false;
    this.editingRuleIndex = -1;
  }

  savePolicy(): void {
    this.storageService.setLifecyclePolicy(this.bucketName, this.policy).subscribe({
      next: (savedPolicy: any) => {
        this.policy = savedPolicy;
        console.log('Policy saved successfully');
      },
      error: (error: any) => {
        console.error('Error saving policy:', error);
        alert('Failed to save policy. Please try again.');
      }
    });
  }

  getActionLabel(action: string): string {
    switch (action) {
      case 'expire': return 'EXPIRE';
      case 'transition': return 'TRANSITION';
      case 'delete': return 'DELETE';
      default: return action.toUpperCase();
    }
  }

  getActionDescription(action: string): string {
    switch (action) {
      case 'expire': return 'Expire objects (soft delete)';
      case 'transition': return 'Change storage class';
      case 'delete': return 'Permanently delete objects';
      default: return action;
    }
  }
}
