import { Component, OnInit, Input } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VersioningService, ObjectVersion, VersionHistory, VersionAnalytics } from '../../services/versioning.service';

@Component({
  selector: 'app-version-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="version-management">
      <div class="version-header">
        <h5>📚 Version Management</h5>
        <div class="object-info">
          <span class="object-key">{{ objectKey }}</span>
          <span class="bucket-name">{{ bucketName }}</span>
        </div>
      </div>

      <!-- Version Actions -->
      <div class="version-actions">
        <div class="btn-group" role="group">
          <button class="btn btn-sm btn-outline-primary" (click)="loadVersions()">
            🔄 Refresh
          </button>
          <button class="btn btn-sm btn-outline-info" (click)="showHistory = !showHistory">
            📈 {{ showHistory ? 'Hide' : 'Show' }} History
          </button>
          <button class="btn btn-sm btn-outline-success" (click)="showAnalytics = !showAnalytics">
            📊 {{ showAnalytics ? 'Hide' : 'Show' }} Analytics
          </button>
        </div>
      </div>

      <!-- Versions List -->
      <div class="versions-list" *ngIf="versions.length > 0">
        <div class="list-header">
          <h6>📋 Versions ({{ totalVersions }})</h6>
          <div class="view-toggle">
            <div class="btn-group btn-group-sm" role="group">
              <input type="radio" class="btn-check" name="viewMode" id="listView" checked>
              <label class="btn btn-outline-secondary" for="listView">List</label>
              
              <input type="radio" class="btn-check" name="viewMode" id="compactView">
              <label class="btn btn-outline-secondary" for="compactView">Compact</label>
            </div>
          </div>
        </div>

        <!-- Detailed View -->
        <div class="versions-detailed" *ngIf="viewMode === 'list'">
          <div class="version-item" 
               *ngFor="let version of versions" 
               [class.current-version]="version.is_current">
            <div class="version-main">
              <div class="version-info">
                <div class="version-header-row">
                  <span class="version-number">v{{ version.version }}</span>
                  <span class="version-status">{{ versioningService.getVersionStatusIcon(version) }}</span>
                  <span class="version-date">{{ versioningService.getRelativeTime(version.created_at) }}</span>
                  <span class="version-size">{{ versioningService.formatFileSize(version.size) }}</span>
                </div>
                <div class="version-meta">
                  <span class="content-type">{{ version.content_type }}</span>
                  <span class="etag">ETag: {{ version.etag.substring(0, 8) }}...</span>
                </div>
              </div>
              
              <div class="version-actions">
                <button class="btn btn-sm btn-outline-success" 
                        (click)="restoreVersion(version)"
                        [disabled]="!versioningService.canRestoreVersion(version)">
                  🔄 Restore
                </button>
                <button class="btn btn-sm btn-outline-warning" 
                        (click)="compareWithPrevious(version)"
                        [disabled]="!canCompareWithPrevious(version)">
                  ⚖️ Compare
                </button>
                <button class="btn btn-sm btn-outline-info" 
                        (click)="tagVersion(version)">
                  🏷️ Tag
                </button>
                <button class="btn btn-sm btn-outline-danger" 
                        (click)="deleteVersion(version)"
                        [disabled]="!versioningService.canDeleteVersion(version, totalVersions)">
                  🗑️ Delete
                </button>
              </div>
            </div>
            
            <!-- Version Tags -->
            <div class="version-tags" *ngIf="hasTags(version)">
              <div class="tag" *ngFor="let tag of getVersionTags(version)">
                <span class="tag-name">{{ tag.name }}</span>
                <span class="tag-description">{{ tag.description }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Compact View -->
        <div class="versions-compact" *ngIf="viewMode === 'compact'">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Size</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let version of versions" [class.current-version]="version.is_current">
                <td>
                  <span class="version-number">v{{ version.version }}</span>
                </td>
                <td>
                  {{ versioningService.getVersionStatusIcon(version) }}
                </td>
                <td>{{ versioningService.formatFileSize(version.size) }}</td>
                <td>{{ versioningService.getRelativeTime(version.created_at) }}</td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-success" 
                            (click)="restoreVersion(version)"
                            [disabled]="!versioningService.canRestoreVersion(version)"
                            title="Restore">
                      🔄
                    </button>
                    <button class="btn btn-outline-warning" 
                            (click)="compareWithPrevious(version)"
                            [disabled]="!canCompareWithPrevious(version)"
                            title="Compare">
                      ⚖️
                    </button>
                    <button class="btn btn-outline-danger" 
                            (click)="deleteVersion(version)"
                            [disabled]="!versioningService.canDeleteVersion(version, totalVersions)"
                            title="Delete">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- No Versions -->
      <div class="no-versions" *ngIf="versions.length === 0 && !isLoading">
        <div class="no-versions-icon">📚</div>
        <h6>No Versions Available</h6>
        <p class="text-muted">This object doesn't have any version history yet.</p>
      </div>

      <!-- Loading -->
      <div class="loading" *ngIf="isLoading">
        <div class="spinner-border spinner-border-sm" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <span class="ms-2">Loading versions...</span>
      </div>

      <!-- Version History -->
      <div class="version-history" *ngIf="showHistory && versionHistory.length > 0">
        <h6>📈 Version History</h6>
        <div class="history-timeline">
          <div class="history-item" *ngFor="let item of versionHistory">
            <div class="history-marker">
              {{ versioningService.getChangeIcon(item.change_summary) }}
            </div>
            <div class="history-content">
              <div class="history-version">v{{ item.version.version }}</div>
              <div class="history-summary">{{ item.change_summary }}</div>
              <div class="history-date">{{ versioningService.formatDate(item.version.created_at) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Version Analytics -->
      <div class="version-analytics" *ngIf="showAnalytics && analytics">
        <h6>📊 Version Analytics</h6>
        <div class="analytics-grid">
          <div class="analytics-card">
            <h6>Total Versions</h6>
            <div class="analytics-value">{{ analytics.total_versions }}</div>
          </div>
          <div class="analytics-card">
            <h6>Storage Used</h6>
            <div class="analytics-value">{{ versioningService.formatFileSize(analytics.storage_impact.total_storage_used) }}</div>
            <small class="text-muted">{{ analytics.storage_impact.historical_percentage.toFixed(1) }}% historical</small>
          </div>
          <div class="analytics-card">
            <h6>Version Frequency</h6>
            <div class="analytics-value">{{ formatInterval(analytics.version_frequency.average_interval) }}</div>
            <small class="text-muted">Average time between versions</small>
          </div>
          <div class="analytics-card">
            <h6>Storage Trend</h6>
            <div class="analytics-value">
              <span class="trend-indicator {{ getStorageTrend() }}">
                {{ getTrendIcon() }} {{ getStorageTrend() }}
              </span>
            </div>
          </div>
        </div>

        <!-- Size Evolution Chart -->
        <div class="size-evolution">
          <h6>Size Evolution</h6>
          <div class="size-chart">
            <div class="chart-bar" 
                 *ngFor="let point of analytics.size_evolution"
                 [style.height.%]="getBarHeight(point.size, analytics.size_evolution)"
                 [title]="'v' + point.version + ': ' + versioningService.formatFileSize(point.size)">
              <div class="bar-label">v{{ point.version }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Comparison Modal -->
      <div class="comparison-modal" *ngIf="showComparisonModal">
        <div class="modal-content">
          <div class="modal-header">
            <h6>⚖️ Version Comparison</h6>
            <button class="btn-close" (click)="showComparisonModal = false"></button>
          </div>
          <div class="modal-body">
            <div class="comparison-content" *ngIf="comparisonResult">
              <div class="comparison-versions">
                <div class="version-comparison-card">
                  <h6>Version {{ comparisonResult.version1.version }}</h6>
                  <div class="version-details">
                    <div>Size: {{ versioningService.formatFileSize(comparisonResult.version1.size) }}</div>
                    <div>Type: {{ comparisonResult.version1.content_type }}</div>
                    <div>Date: {{ versioningService.formatDate(comparisonResult.version1.created_at) }}</div>
                  </div>
                </div>
                <div class="vs-divider">VS</div>
                <div class="version-comparison-card">
                  <h6>Version {{ comparisonResult.version2.version }}</h6>
                  <div class="version-details">
                    <div>Size: {{ versioningService.formatFileSize(comparisonResult.version2.size) }}</div>
                    <div>Type: {{ comparisonResult.version2.content_type }}</div>
                    <div>Date: {{ versioningService.formatDate(comparisonResult.version2.created_at) }}</div>
                  </div>
                </div>
              </div>
              
              <div class="comparison-differences">
                <h6>Differences</h6>
                <div class="difference-item" *ngIf="comparisonResult.comparison.size">
                  <span class="diff-label">Size:</span>
                  <span class="diff-value">
                    {{ comparisonResult.comparison.size.change > 0 ? '+' : '' }}
                    {{ versioningService.formatFileSize(comparisonResult.comparison.size.change) }}
                    ({{ comparisonResult.comparison.size.change_percent > 0 ? '+' : '' }}
                    {{ comparisonResult.comparison.size.change_percent }}%)
                  </span>
                </div>
                <div class="difference-item" *ngIf="comparisonResult.comparison.content_type">
                  <span class="diff-label">Content Type:</span>
                  <span class="diff-value">
                    {{ comparisonResult.comparison.content_type.version1 }} → 
                    {{ comparisonResult.comparison.content_type.version2 }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .version-management {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .version-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .version-header h5 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .object-info {
      text-align: right;
    }

    .object-key {
      display: block;
      font-weight: 500;
      color: #495057;
    }

    .bucket-name {
      display: block;
      font-size: 12px;
      color: #6c757d;
    }

    .version-actions {
      margin-bottom: 16px;
    }

    .list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .list-header h6 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .version-item {
      border: 1px solid #e9ecef;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: all 0.2s;
    }

    .version-item:hover {
      border-color: #007bff;
      box-shadow: 0 2px 8px rgba(0,123,255,0.1);
    }

    .version-item.current-version {
      border-color: #28a745;
      background: linear-gradient(135deg, rgba(40,167,69,0.05) 0%, rgba(40,167,69,0.02) 100%);
    }

    .version-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
    }

    .version-info {
      flex: 1;
    }

    .version-header-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 4px;
    }

    .version-number {
      font-weight: 600;
      color: #495057;
    }

    .version-status {
      font-size: 16px;
    }

    .version-date {
      font-size: 12px;
      color: #6c757d;
    }

    .version-size {
      font-size: 12px;
      color: #6c757d;
      font-weight: 500;
    }

    .version-meta {
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: #6c757d;
    }

    .version-actions {
      display: flex;
      gap: 4px;
    }

    .version-tags {
      padding: 8px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e9ecef;
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      margin-right: 8px;
      margin-bottom: 4px;
    }

    .tag-name {
      font-weight: 500;
    }

    .tag-description {
      opacity: 0.8;
    }

    .no-versions {
      text-align: center;
      padding: 48px 24px;
      color: #6c757d;
    }

    .no-versions-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .loading {
      text-align: center;
      padding: 24px;
      color: #6c757d;
    }

    .version-history {
      margin-top: 24px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .history-timeline {
      margin-top: 12px;
    }

    .history-item {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
    }

    .history-marker {
      font-size: 16px;
      flex-shrink: 0;
    }

    .history-content {
      flex: 1;
    }

    .history-version {
      font-weight: 500;
      color: #495057;
    }

    .history-summary {
      font-size: 12px;
      color: #6c757d;
      margin: 2px 0;
    }

    .history-date {
      font-size: 11px;
      color: #6c757d;
    }

    .version-analytics {
      margin-top: 24px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-top: 12px;
    }

    .analytics-card {
      background: white;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }

    .analytics-card h7 {
      display: block;
      font-size: 12px;
      color: #6c757d;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .analytics-value {
      font-size: 20px;
      font-weight: 600;
      color: #495057;
    }

    .trend-indicator {
      font-weight: 500;
    }

    .trend-indicator.increasing {
      color: #28a745;
    }

    .trend-indicator.decreasing {
      color: #dc3545;
    }

    .trend-indicator.stable {
      color: #ffc107;
    }

    .size-evolution {
      margin-top: 24px;
    }

    .size-chart {
      display: flex;
      align-items: end;
      gap: 8px;
      height: 120px;
      margin-top: 12px;
    }

    .chart-bar {
      flex: 1;
      background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
      border-radius: 4px 4px 0 0;
      min-height: 8px;
      position: relative;
      transition: all 0.2s;
    }

    .chart-bar:hover {
      opacity: 0.8;
    }

    .bar-label {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      color: #6c757d;
      white-space: nowrap;
    }

    .comparison-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-bottom: 1px solid #e9ecef;
    }

    .modal-body {
      padding: 24px;
    }

    .comparison-versions {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }

    .version-comparison-card {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
    }

    .vs-divider {
      display: flex;
      align-items: center;
      font-weight: 600;
      color: #6c757d;
    }

    .version-details {
      margin-top: 8px;
      font-size: 12px;
      color: #6c757d;
    }

    .version-details div {
      margin-bottom: 2px;
    }

    .comparison-differences {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
    }

    .difference-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e9ecef;
    }

    .difference-item:last-child {
      border-bottom: none;
    }

    .diff-label {
      font-weight: 500;
      color: #495057;
    }

    .diff-value {
      color: #6c757d;
    }

    @media (max-width: 768px) {
      .version-main {
        flex-direction: column;
        gap: 12px;
      }
      
      .version-actions {
        width: 100%;
        justify-content: flex-end;
      }
      
      .analytics-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      
      .comparison-versions {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      
      .vs-divider {
        text-align: center;
      }
    }
  `]
})
export class VersionManagementComponent implements OnInit {
  @Input() bucketName: string = '';
  @Input() objectKey: string = '';

  versions: ObjectVersion[] = [];
  versionHistory: VersionHistory[] = [];
  analytics: VersionAnalytics | null = null;
  comparisonResult: any = null;

  isLoading = false;
  showHistory = false;
  showAnalytics = false;
  showComparisonModal = false;
  viewMode = 'list';

  totalVersions = 0;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    protected versioningService: VersioningService
  ) {}

  ngOnInit(): void {
    if (this.bucketName && this.objectKey) {
      this.loadVersions();
    }
  }

  loadVersions(): void {
    if (!this.bucketName || !this.objectKey) return;

    this.isLoading = true;
    this.versioningService.getVersions(this.bucketName, this.objectKey).subscribe(response => {
      this.versions = response.versions;
      this.totalVersions = response.total_versions;
      this.isLoading = false;
    });
  }

  restoreVersion(version: ObjectVersion): void {
    if (!confirm(`Are you sure you want to restore to version ${version.version}?`)) return;

    this.versioningService.restoreVersion(this.bucketName, this.objectKey, version.id).subscribe(response => {
      console.log('Version restored:', response);
      this.loadVersions(); // Refresh the versions list
    });
  }

  compareWithPrevious(version: ObjectVersion): void {
    const currentIndex = this.versions.findIndex(v => v.id === version.id);
    if (currentIndex < this.versions.length - 1) {
      const previousVersion = this.versions[currentIndex + 1];
      this.compareVersions(previousVersion, version);
    }
  }

  compareVersions(version1: ObjectVersion, version2: ObjectVersion): void {
    this.versioningService.compareVersions(this.bucketName, this.objectKey, version1.id, version2.id).subscribe(result => {
      this.comparisonResult = result;
      this.showComparisonModal = true;
    });
  }

  deleteVersion(version: ObjectVersion): void {
    if (!confirm(`Are you sure you want to delete version ${version.version}? This action cannot be undone.`)) return;

    this.versioningService.deleteVersion(this.bucketName, this.objectKey, version.id).subscribe(response => {
      console.log('Version deleted:', response);
      this.loadVersions(); // Refresh the versions list
    });
  }

  tagVersion(version: ObjectVersion): void {
    const tagName = prompt('Enter tag name:');
    if (!tagName) return;

    const tagDescription = prompt('Enter tag description (optional):') || '';

    this.versioningService.tagVersion(this.bucketName, this.objectKey, version.id, tagName, tagDescription).subscribe(response => {
      console.log('Version tagged:', response);
      this.loadVersions(); // Refresh the versions list
    });
  }

  canCompareWithPrevious(version: ObjectVersion): boolean {
    const currentIndex = this.versions.findIndex(v => v.id === version.id);
    return currentIndex < this.versions.length - 1;
  }

  hasTags(version: ObjectVersion): boolean {
    return version.metadata && version.metadata.tags && Object.keys(version.metadata.tags).length > 0;
  }

  getVersionTags(version: ObjectVersion): Array<{ name: string; description: string }> {
    if (!version.metadata || !version.metadata.tags) return [];
    
    return Object.entries(version.metadata.tags).map(([name, info]: [string, any]) => ({
      name,
      description: info.description || ''
    }));
  }

  getStorageTrend(): string {
    if (!this.analytics) return 'stable';
    return this.versioningService.getStorageTrend(this.analytics);
  }

  getTrendIcon(): string {
    const trend = this.getStorageTrend();
    switch (trend) {
      case 'increasing': return '📈';
      case 'decreasing': return '📉';
      default: return '➡️';
    }
  }

  getBarHeight(size: number, evolution: any[]): number {
    if (!evolution.length) return 0;
    const maxSize = Math.max(...evolution.map(e => e.size));
    return (size / maxSize) * 100;
  }

  formatInterval(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
  }
}
