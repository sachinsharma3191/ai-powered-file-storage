import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { SearchService, SearchFilters, SearchResult, SearchSuggestion } from '../../services/search.service';

@Component({
  selector: 'app-advanced-search',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="advanced-search">
      <div class="search-header">
        <h5>🔍 Advanced Search</h5>
        <p class="text-muted">Search across all your storage with powerful filters</p>
      </div>

      <!-- Search Form -->
      <div class="search-form">
        <div class="search-input-group">
          <div class="search-input-wrapper">
            <input 
              type="text" 
              class="form-control search-input" 
              placeholder="Search for files, folders, or content..."
              [formControl]="searchControl"
              #searchInput>
            <div class="search-input-icon">🔍</div>
          </div>
          
          <!-- Search Suggestions -->
          <div class="search-suggestions" *ngIf="suggestions.length > 0 && showSuggestions">
            <div 
              class="suggestion-item" 
              *ngFor="let suggestion of suggestions"
              (click)="selectSuggestion(suggestion)">
              <span class="suggestion-icon">{{ getSuggestionIcon(suggestion.type) }}</span>
              <span class="suggestion-value">{{ suggestion.value }}</span>
            </div>
          </div>
        </div>

        <!-- Search Type Toggle -->
        <div class="search-type-toggle">
          <div class="btn-group" role="group">
            <input type="radio" class="btn-check" name="searchType" id="textSearch" checked>
            <label class="btn btn-outline-primary" for="textSearch">
              📝 Text Search
            </label>
            
            <input type="radio" class="btn-check" name="searchType" id="semanticSearch">
            <label class="btn btn-outline-primary" for="semanticSearch">
              🤖 Semantic Search
            </label>
          </div>
        </div>

        <!-- Filters Section -->
        <div class="filters-section">
          <div class="filters-header">
            <h6>🎛️ Filters</h6>
            <button class="btn btn-sm btn-outline-secondary" (click)="toggleFilters()">
              {{ showFilters ? 'Hide' : 'Show' }} Filters
            </button>
          </div>

          <div class="filters-content" *ngIf="showFilters">
            <div class="row">
              <!-- Content Type Filter -->
              <div class="col-md-6">
                <label class="form-label">Content Type</label>
                <select class="form-select" formControlName="content_type">
                  <option value="">All Types</option>
                  <option value="image/">Images</option>
                  <option value="video/">Videos</option>
                  <option value="audio/">Audio</option>
                  <option value="application/pdf">PDF</option>
                  <option value="text/">Text Files</option>
                  <option value="application/json">JSON</option>
                  <option value="application/xml">XML</option>
                </select>
              </div>

              <!-- Size Range -->
              <div class="col-md-6">
                <label class="form-label">Size Range</label>
                <div class="size-range-inputs">
                  <input 
                    type="number" 
                    class="form-control" 
                    placeholder="Min (MB)"
                    formControlName="size_min">
                  <span class="size-separator">-</span>
                  <input 
                    type="number" 
                    class="form-control" 
                    placeholder="Max (MB)"
                    formControlName="size_max">
                </div>
              </div>

              <!-- Date Range -->
              <div class="col-md-6">
                <label class="form-label">Date From</label>
                <input 
                  type="date" 
                  class="form-control"
                  formControlName="date_from">
              </div>

              <div class="col-md-6">
                <label class="form-label">Date To</label>
                <input 
                  type="date" 
                  class="form-control"
                  formControlName="date_to">
              </div>

              <!-- Tags -->
              <div class="col-md-12">
                <label class="form-label">Tags</label>
                <input 
                  type="text" 
                  class="form-control" 
                  placeholder="Enter tags separated by commas"
                  formControlName="tags">
              </div>
            </div>
          </div>
        </div>

        <!-- Search Actions -->
        <div class="search-actions">
          <button class="btn btn-primary" (click)="performSearch()" [disabled]="isSearching">
            <span *ngIf="!isSearching">🔍 Search</span>
            <span *ngIf="isSearching">⏳ Searching...</span>
          </button>
          <button class="btn btn-outline-secondary" (click)="clearSearch()">
            🗑️ Clear
          </button>
        </div>
      </div>

      <!-- Search Results -->
      <div class="search-results" *ngIf="searchResults.length > 0 || hasSearched">
        <div class="results-header">
          <h6>📋 Results ({{ totalResults }})</h6>
          <div class="results-actions">
            <select class="form-select form-select-sm" [formControl]="sortControl">
              <option value="created_at">Newest First</option>
              <option value="created_at_asc">Oldest First</option>
              <option value="name">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="size">Size (Largest)</option>
              <option value="size_asc">Size (Smallest)</option>
            </select>
          </div>
        </div>

        <!-- Results List -->
        <div class="results-list">
          <div class="result-item" *ngFor="let result of searchResults">
            <div class="result-icon">
              {{ searchService.getContentTypeIcon(result.content_type) }}
            </div>
            <div class="result-content">
              <div class="result-name">{{ result.key }}</div>
              <div class="result-meta">
                <span class="result-bucket">{{ result.bucket_name }}</span>
                <span class="result-size">{{ searchService.formatFileSize(result.size) }}</span>
                <span class="result-date">{{ getRelativeTime(result.created_at) }}</span>
                <span class="result-score" *ngIf="result.similarity_score">
                  {{ (result.similarity_score * 100).toFixed(1) }}% match
                </span>
              </div>
            </div>
            <div class="result-actions">
              <button class="btn btn-sm btn-outline-primary" 
                      *ngIf="searchService.isPreviewable(result.content_type)"
                      (click)="previewFile(result)">
                👁️ Preview
              </button>
              <button class="btn btn-sm btn-outline-secondary" 
                      (click)="downloadFile(result)">
                ⬇️ Download
              </button>
              <button class="btn btn-sm btn-outline-info" 
                      (click)="showVersions(result)">
                📚 Versions
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div class="results-pagination" *ngIf="totalPages > 1">
          <nav>
            <ul class="pagination pagination-sm">
              <li class="page-item" [class.disabled]="currentPage === 1">
                <a class="page-link" href="#" (click)="changePage(currentPage - 1)">Previous</a>
              </li>
              <li class="page-item" *ngFor="let page of getPages()" [class.active]="page === currentPage">
                <a class="page-link" href="#" (click)="changePage(page)">{{ page }}</a>
              </li>
              <li class="page-item" [class.disabled]="currentPage === totalPages">
                <a class="page-link" href="#" (click)="changePage(currentPage + 1)">Next</a>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <!-- No Results -->
      <div class="no-results" *ngIf="hasSearched && searchResults.length === 0">
        <div class="no-results-icon">🔍</div>
        <h6>No Results Found</h6>
        <p class="text-muted">Try adjusting your search terms or filters</p>
      </div>

      <!-- Search Analytics -->
      <div class="search-analytics" *ngIf="showAnalytics">
        <h6>📊 Search Analytics</h6>
        <div class="analytics-grid">
          <div class="analytics-item">
            <span class="analytics-label">Total Searches</span>
            <span class="analytics-value">{{ analytics?.total_searches || 0 }}</span>
          </div>
          <div class="analytics-item">
            <span class="analytics-label">Unique Queries</span>
            <span class="analytics-value">{{ analytics?.unique_queries || 0 }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .advanced-search {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .search-header {
      text-align: center;
      margin-bottom: 24px;
    }

    .search-header h5 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .search-input-group {
      position: relative;
      margin-bottom: 16px;
    }

    .search-input-wrapper {
      position: relative;
    }

    .search-input {
      padding-left: 40px;
      font-size: 16px;
      border-radius: 8px;
      border: 2px solid #e9ecef;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: #007bff;
      box-shadow: 0 0 0 0.2rem rgba(0,123,255,0.25);
    }

    .search-input-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 16px;
      color: #6c757d;
    }

    .search-suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #e9ecef;
      border-top: none;
      border-radius: 0 0 8px 8px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
    }

    .suggestion-item {
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background-color 0.2s;
    }

    .suggestion-item:hover {
      background-color: #f8f9fa;
    }

    .suggestion-icon {
      font-size: 14px;
    }

    .search-type-toggle {
      margin-bottom: 16px;
    }

    .filters-section {
      margin-bottom: 16px;
    }

    .filters-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .filters-header h6 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .size-range-inputs {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .size-range-inputs input {
      flex: 1;
    }

    .size-separator {
      color: #6c757d;
      font-weight: 500;
    }

    .search-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .results-header h6 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .results-actions select {
      width: 150px;
    }

    .result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      margin-bottom: 8px;
      transition: background-color 0.2s;
    }

    .result-item:hover {
      background-color: #f8f9fa;
    }

    .result-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .result-content {
      flex: 1;
    }

    .result-name {
      font-weight: 500;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .result-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #6c757d;
    }

    .result-score {
      background: #e3f2fd;
      color: #1976d2;
      padding: 2px 6px;
      border-radius: 12px;
      font-weight: 500;
    }

    .result-actions {
      display: flex;
      gap: 4px;
    }

    .no-results {
      text-align: center;
      padding: 48px 24px;
      color: #6c757d;
    }

    .no-results-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .search-analytics {
      margin-top: 24px;
      padding: 16px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .analytics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-top: 12px;
    }

    .analytics-item {
      text-align: center;
    }

    .analytics-label {
      display: block;
      font-size: 12px;
      color: #6c757d;
      margin-bottom: 4px;
    }

    .analytics-value {
      display: block;
      font-size: 18px;
      font-weight: 600;
      color: #495057;
    }
  `]
})
export class AdvancedSearchComponent implements OnInit {
  searchControl = new FormControl('');
  sortControl = new FormControl('created_at');
  filtersForm = new FormGroup({
    content_type: new FormControl(''),
    size_min: new FormControl(''),
    size_max: new FormControl(''),
    date_from: new FormControl(''),
    date_to: new FormControl(''),
    tags: new FormControl('')
  });

  searchResults: SearchResult[] = [];
  suggestions: SearchSuggestion[] = [];
  analytics: any = null;
  
  isSearching = false;
  hasSearched = false;
  showFilters = false;
  showSuggestions = false;
  showAnalytics = false;
  
  totalResults = 0;
  currentPage = 1;
  totalPages = 0;
  
  private searchSubject = new Subject<string>();

  constructor(
    protected searchService: SearchService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.setupSearchSubscription();
    this.setupSortSubscription();
  }

  private setupSearchSubscription(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (query.length >= 2) {
          return this.searchService.getSuggestions(query);
        }
        return [];
      })
    ).subscribe(suggestions => {
      this.suggestions = suggestions;
      this.showSuggestions = suggestions.length > 0;
    });
  }

  private setupSortSubscription(): void {
    this.sortControl.valueChanges.subscribe(() => {
      if (this.hasSearched) {
        this.performSearch();
      }
    });
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchSubject.next(query);
  }

  selectSuggestion(suggestion: SearchSuggestion): void {
    this.searchControl.setValue(suggestion.value);
    this.showSuggestions = false;
    this.performSearch();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  performSearch(): void {
    const query = this.searchControl.value?.trim();
    if (!query) return;

    this.isSearching = true;
    this.hasSearched = true;

    const filters = this.buildFilters();
    const sortValue = this.sortControl.value || 'created_at_desc';
    const sortBy = sortValue.split('_')[0];
    const sortOrder = sortValue.includes('asc') ? 'asc' : 'desc';

    this.searchService.search(
      query,
      undefined,
      filters,
      sortBy,
      sortOrder,
      this.currentPage
    ).subscribe(response => {
      this.searchResults = response.results;
      this.totalResults = response.total;
      this.totalPages = response.total_pages;
      this.isSearching = false;
    });
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.filtersForm.reset();
    this.searchResults = [];
    this.hasSearched = false;
    this.currentPage = 1;
    this.showSuggestions = false;
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.performSearch();
  }

  getPages(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  previewFile(result: SearchResult): void {
    // Implement file preview logic
    console.log('Preview file:', result);
  }

  downloadFile(result: SearchResult): void {
    const downloadUrl = this.searchService.getDownloadUrl(result.bucket_name, result.key);
    window.open(downloadUrl, '_blank');
  }

  showVersions(result: SearchResult): void {
    // Implement version management integration
    console.log('Show versions for:', result);
  }

  private buildFilters(): SearchFilters {
    const formValue = this.filtersForm.value;
    
    const filters: SearchFilters = {};
    
    if (formValue.content_type) {
      filters.content_type = [formValue.content_type];
    }
    
    if (formValue.size_min) {
      filters.size_min = Number(formValue.size_min) * 1024 * 1024; // Convert MB to bytes
    }
    
    if (formValue.size_max) {
      filters.size_max = Number(formValue.size_max) * 1024 * 1024; // Convert MB to bytes
    }
    
    if (formValue.date_from) {
      filters.date_from = formValue.date_from;
    }
    
    if (formValue.date_to) {
      filters.date_to = formValue.date_to;
    }
    
    if (formValue.tags) {
      filters.tags = formValue.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    return filters;
  }

  protected getSuggestionIcon(type: string): string {
    return type === 'prefix' ? '📁' : '📄';
  }

  protected getRelativeTime(date: string): string {
    return this.searchService.getRelativeTime ? 
      this.searchService.getRelativeTime(date) : 
      new Date(date).toLocaleDateString();
  }
}
