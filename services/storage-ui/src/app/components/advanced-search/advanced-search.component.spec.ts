import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule, FormBuilder } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { of, throwError } from 'rxjs';
import { By } from '@angular/platform-browser';

import { AdvancedSearchComponent } from './advanced-search.component';
import { SearchService, SearchFilters, SearchResult, SearchSuggestion } from '../../services/search.service';

describe('AdvancedSearchComponent', () => {
  let component: AdvancedSearchComponent;
  let fixture: ComponentFixture<AdvancedSearchComponent>;
  let mockSearchService: jasmine.SpyObj<SearchService>;
  let formBuilder: FormBuilder;

  const mockSearchResults: SearchResult[] = [
    {
      id: '1',
      name: 'test-file.pdf',
      content_type: 'application/pdf',
      size: 1024000,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      url: 'http://example.com/test-file.pdf',
      preview_url: 'http://example.com/preview/test-file.pdf',
      metadata: { author: 'Test User' }
    }
  ];

  const mockSuggestions: SearchSuggestion[] = [
    { type: 'prefix', value: 'test' },
    { type: 'content', value: 'pdf' }
  ];

  beforeEach(async () => {
    const searchServiceSpy = jasmine.createSpyObj('SearchService', [
      'search',
      'getSuggestions',
      'getContentTypeIcon',
      'formatFileSize',
      'getRelativeTime'
    ]);

    searchServiceSpy.search.and.returnValue(of({
      results: mockSearchResults,
      total: 1,
      page: 1,
      per_page: 10,
      total_pages: 1
    }));
    searchServiceSpy.getSuggestions.and.returnValue(of(mockSuggestions));
    searchServiceSpy.getContentTypeIcon.and.returnValue('📄');
    searchServiceSpy.formatFileSize.and.returnValue('1 MB');
    searchServiceSpy.getRelativeTime.and.returnValue('2 hours ago');

    await TestBed.configureTestingModule({
      imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        AdvancedSearchComponent
      ],
      providers: [
        FormBuilder,
        { provide: SearchService, useValue: searchServiceSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AdvancedSearchComponent);
    component = fixture.componentInstance;
    mockSearchService = TestBed.inject(SearchService) as jasmine.SpyObj<SearchService>;
    formBuilder = TestBed.inject(FormBuilder);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form controls on ngOnInit', () => {
    component.ngOnInit();
    expect(component.searchControl).toBeDefined();
    expect(component.sortControl).toBeDefined();
    expect(component.filtersForm).toBeDefined();
  });

  describe('Form Initialization', () => {
    it('should create search control with empty value', () => {
      expect(component.searchControl.value).toBe('');
    });

    it('should create sort control with default value', () => {
      expect(component.sortControl.value).toBe('created_at_desc');
    });

    it('should create filters form with all required controls', () => {
      const form = component.filtersForm;
      expect(form.get('content_type')).toBeDefined();
      expect(form.get('size_min')).toBeDefined();
      expect(form.get('size_max')).toBeDefined();
      expect(form.get('date_from')).toBeDefined();
      expect(form.get('date_to')).toBeDefined();
      expect(form.get('tags')).toBeDefined();
    });
  });

  describe('Search Functionality', () => {
    it('should perform search when query is provided', waitForAsync(() => {
      component.searchControl.setValue('test query');
      component.performSearch();
      
      fixture.whenStable().then(() => {
        expect(mockSearchService.search).toHaveBeenCalledWith(
          'test query',
          undefined,
          jasmine.any(Object),
          'created_at',
          'desc',
          1
        );
        expect(component.isSearching).toBeFalse();
        expect(component.hasSearched).toBeTrue();
        expect(component.searchResults).toEqual(mockSearchResults);
      });
    }));

    it('should not search when query is empty', () => {
      component.searchControl.setValue('');
      component.performSearch();
      
      expect(mockSearchService.search).not.toHaveBeenCalled();
      expect(component.isSearching).toBeFalse();
      expect(component.hasSearched).toBeFalse();
    });

    it('should handle search errors gracefully', waitForAsync(() => {
      mockSearchService.search.and.returnValue(throwError(() => new Error('Search failed')));
      component.searchControl.setValue('test query');
      
      component.performSearch();
      
      fixture.whenStable().then(() => {
        expect(component.isSearching).toBeFalse();
        expect(component.searchResults).toEqual([]);
      });
    }));

    it('should build filters correctly from form values', () => {
      component.filtersForm.patchValue({
        content_type: 'application/pdf',
        size_min: '10',
        size_max: '100',
        date_from: '2024-01-01',
        date_to: '2024-12-31',
        tags: 'tag1,tag2'
      });

      const filters = component.buildFilters();
      
      expect(filters.content_type).toEqual(['application/pdf']);
      expect(filters.size_min).toBe(10 * 1024 * 1024);
      expect(filters.size_max).toBe(100 * 1024 * 1024);
      expect(filters.date_from).toBe('2024-01-01');
      expect(filters.date_to).toBe('2024-12-31');
      expect(filters.tags).toEqual(['tag1', 'tag2']);
    });

    it('should handle empty form values when building filters', () => {
      component.filtersForm.patchValue({
        content_type: '',
        size_min: '',
        size_max: '',
        date_from: '',
        date_to: '',
        tags: ''
      });

      const filters = component.buildFilters();
      
      expect(filters.content_type).toBeUndefined();
      expect(filters.size_min).toBeUndefined();
      expect(filters.size_max).toBeUndefined();
      expect(filters.date_from).toBeUndefined();
      expect(filters.date_to).toBeUndefined();
      expect(filters.tags).toBeUndefined();
    });
  });

  describe('UI Interactions', () => {
    it('should toggle filters visibility', () => {
      expect(component.showFilters).toBeFalse();
      
      component.toggleFilters();
      expect(component.showFilters).toBeTrue();
      
      component.toggleFilters();
      expect(component.showFilters).toBeFalse();
    });

    it('should toggle analytics visibility', () => {
      expect(component.showAnalytics).toBeFalse();
      
      component.toggleAnalytics();
      expect(component.showAnalytics).toBeTrue();
      
      component.toggleAnalytics();
      expect(component.showAnalytics).toBeFalse();
    });

    it('should clear search results', () => {
      component.searchResults = mockSearchResults;
      component.hasSearched = true;
      component.totalResults = 1;
      
      component.clearSearch();
      
      expect(component.searchResults).toEqual([]);
      expect(component.hasSearched).toBeFalse();
      expect(component.totalResults).toBe(0);
      expect(component.searchControl.value).toBe('');
    });

    it('should load suggestions on input', waitForAsync(() => {
      component.searchControl.setValue('test');
      component.onSearchInput();
      
      fixture.whenStable().then(() => {
        expect(mockSearchService.getSuggestions).toHaveBeenCalledWith('test');
        expect(component.suggestions).toEqual(mockSuggestions);
        expect(component.showSuggestions).toBeTrue();
      });
    }));

    it('should hide suggestions when input is empty', () => {
      component.showSuggestions = true;
      component.suggestions = mockSuggestions;
      
      component.searchControl.setValue('');
      component.onSearchInput();
      
      expect(component.showSuggestions).toBeFalse();
      expect(component.suggestions).toEqual([]);
    });

    it('should apply suggestion and search', () => {
      const suggestion: SearchSuggestion = { type: 'prefix', value: 'test' };
      
      component.applySuggestion(suggestion);
      
      expect(component.searchControl.value).toBe('test');
      expect(mockSearchService.search).toHaveBeenCalled();
    });
  });

  describe('Pagination', () => {
    it('should go to next page', () => {
      component.currentPage = 1;
      component.totalPages = 3;
      
      component.nextPage();
      
      expect(component.currentPage).toBe(2);
    });

    it('should not go to next page if on last page', () => {
      component.currentPage = 3;
      component.totalPages = 3;
      
      component.nextPage();
      
      expect(component.currentPage).toBe(3);
    });

    it('should go to previous page', () => {
      component.currentPage = 2;
      
      component.previousPage();
      
      expect(component.currentPage).toBe(1);
    });

    it('should not go to previous page if on first page', () => {
      component.currentPage = 1;
      
      component.previousPage();
      
      expect(component.currentPage).toBe(1);
    });

    it('should go to specific page', () => {
      component.goToPage(3);
      
      expect(component.currentPage).toBe(3);
    });
  });

  describe('Helper Methods', () => {
    it('should get correct suggestion icon for prefix type', () => {
      expect(component.getSuggestionIcon('prefix')).toBe('📁');
    });

    it('should get correct suggestion icon for content type', () => {
      expect(component.getSuggestionIcon('content')).toBe('📄');
    });

    it('should get relative time from service', () => {
      const date = '2024-01-01T00:00:00Z';
      const result = component.getRelativeTime(date);
      
      expect(mockSearchService.getRelativeTime).toHaveBeenCalledWith(date);
      expect(result).toBe('2 hours ago');
    });

    it('should return formatted date when getRelativeTime is not available', () => {
      mockSearchService.getRelativeTime = undefined as any;
      const date = '2024-01-01T00:00:00Z';
      
      const result = component.getRelativeTime(date);
      
      expect(result).toBe('1/1/2024');
    });
  });

  describe('Template Rendering', () => {
    it('should render search input', () => {
      const searchInput = fixture.debugElement.query(By.css('input[type="text"]'));
      expect(searchInput).toBeTruthy();
    });

    it('should render filters section when toggled', () => {
      component.showFilters = true;
      fixture.detectChanges();
      
      const filtersSection = fixture.debugElement.query(By.css('.filters-content'));
      expect(filtersSection).toBeTruthy();
    });

    it('should render search results', waitForAsync(() => {
      component.searchResults = mockSearchResults;
      component.hasSearched = true;
      fixture.detectChanges();
      
      const resultItems = fixture.debugElement.queryAll(By.css('.search-result-item'));
      expect(resultItems.length).toBe(1);
    }));

    it('should show "No results found" when search returns empty', waitForAsync(() => {
      mockSearchService.search.and.returnValue(of({
        results: [],
        total: 0,
        page: 1,
        per_page: 10,
        total_pages: 0
      }));
      
      component.searchControl.setValue('empty query');
      component.performSearch();
      
      fixture.whenStable().then(() => {
        fixture.detectChanges();
        const noResults = fixture.debugElement.query(By.css('.no-results'));
        expect(noResults).toBeTruthy();
        expect(noResults.nativeElement.textContent).toContain('No results found');
      });
    }));

    it('should render pagination controls when multiple pages exist', waitForAsync(() => {
      mockSearchService.search.and.returnValue(of({
        results: mockSearchResults,
        total: 25,
        page: 1,
        per_page: 10,
        total_pages: 3
      }));
      
      component.searchControl.setValue('test');
      component.performSearch();
      
      fixture.whenStable().then(() => {
        fixture.detectChanges();
        const pagination = fixture.debugElement.query(By.css('.pagination'));
        expect(pagination).toBeTruthy();
      });
    }));
  });

  describe('Sort Functionality', () => {
    it('should update sort order and re-search', waitForAsync(() => {
      component.searchControl.setValue('test');
      component.performSearch();
      
      fixture.whenStable().then(() => {
        mockSearchService.search.calls.reset();
        
        component.sortControl.setValue('name_asc');
        
        expect(mockSearchService.search).toHaveBeenCalledWith(
          'test',
          undefined,
          jasmine.any(Object),
          'name',
          'asc',
          1
        );
      });
    }));
  });

  describe('Component Lifecycle', () => {
    it('should set up subscriptions on ngOnInit', () => {
      const searchSpy = spyOn(component, 'setupSearchSubscription');
      const sortSpy = spyOn(component, 'setupSortSubscription');
      
      component.ngOnInit();
      
      expect(searchSpy).toHaveBeenCalled();
      expect(sortSpy).toHaveBeenCalled();
    });

    it('should handle sort changes via subscription', waitForAsync(() => {
      component.ngOnInit();
      fixture.detectChanges();
      
      mockSearchService.search.calls.reset();
      component.sortControl.setValue('name_asc');
      
      fixture.whenStable().then(() => {
        expect(mockSearchService.search).toHaveBeenCalled();
      });
    }));
  });
});
