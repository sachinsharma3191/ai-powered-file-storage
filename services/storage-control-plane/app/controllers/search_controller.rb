class SearchController < ApplicationController
  before_action :authenticate_api_key!
  before_action :set_bucket

  # Advanced search across buckets and objects
  def search
    query = params[:q]
    bucket_id = params[:bucket_id]
    filters = parse_filters(params[:filters] || {})
    sort_by = params[:sort_by] || 'created_at'
    sort_order = params[:sort_order] || 'desc'
    page = params[:page] || 1
    per_page = params[:per_page] || 20

    if query.blank?
      render json: { error: 'Search query is required' }, status: :bad_request
      return
    end

    results = perform_search(query, bucket_id, filters, sort_by, sort_order, page, per_page)
    
    render json: {
      query: query,
      filters: filters,
      total: results[:total],
      page: page,
      per_page: per_page,
      total_pages: (results[:total].to_f / per_page).ceil,
      results: results[:objects],
      aggregations: results[:aggregations]
    }
  end

  # Semantic search using embeddings
  def semantic_search
    query = params[:q]
    bucket_id = params[:bucket_id]
    threshold = params[:threshold]&.to_f || 0.7

    if query.blank?
      render json: { error: 'Search query is required' }, status: :bad_request
      return
    end

    results = perform_semantic_search(query, bucket_id, threshold)
    
    render json: {
      query: query,
      threshold: threshold,
      results: results[:objects],
      total: results[:total]
    }
  end

  # Search suggestions/autocomplete
  def suggestions
    query = params[:q]
    bucket_id = params[:bucket_id]
    limit = params[:limit]&.to_i || 10

    if query.blank? || query.length < 2
      render json: { suggestions: [] }
      return
    end

    suggestions = generate_suggestions(query, bucket_id, limit)
    
    render json: { suggestions: suggestions }
  end

  # Search analytics
  def analytics
    timeframe = params[:timeframe] || '7d'
    
    analytics_data = get_search_analytics(timeframe)
    
    render json: analytics_data
  end

  private

  def set_bucket
    if params[:bucket_id]
      @bucket = current_account.buckets.find(params[:bucket_id])
    end
  end

  def parse_filters(filters_json)
    return {} unless filters_json.is_a?(Hash)
    
    filters = {}
    
    # Content type filter
    if filters_json[:content_type].present?
      filters[:content_types] = Array(filters_json[:content_type])
    end
    
    # Size filter
    if filters_json[:size_min].present?
      filters[:size_min] = filters_json[:size_min].to_i
    end
    
    if filters_json[:size_max].present?
      filters[:size_max] = filters_json[:size_max].to_i
    end
    
    # Date range filter
    if filters_json[:date_from].present?
      filters[:date_from] = Time.parse(filters_json[:date_from])
    end
    
    if filters_json[:date_to].present?
      filters[:date_to] = Time.parse(filters_json[:date_to])
    end
    
    # Tags filter
    if filters_json[:tags].present?
      filters[:tags] = Array(filters_json[:tags])
    end
    
    # Metadata filter
    if filters_json[:metadata].present?
      filters[:metadata] = filters_json[:metadata]
    end
    
    filters
  end

  def perform_search(query, bucket_id, filters, sort_by, sort_order, page, per_page)
    base_query = StorageObject.joins(:current_version)
    
    # Scope to specific bucket if provided
    if bucket_id
      base_query = base_query.where(bucket_id: bucket_id)
    else
      base_query = base_query.where(bucket: current_account.buckets)
    end
    
    # Apply text search
    base_query = base_query.where(
      'storage_objects.key ILIKE ? OR object_versions.content ILIKE ?',
      "%#{query}%", "%#{query}%"
    )
    
    # Apply filters
    base_query = apply_filters(base_query, filters)
    
    # Count total results
    total = base_query.count
    
    # Apply sorting
    base_query = apply_sorting(base_query, sort_by, sort_order)
    
    # Apply pagination
    offset = (page.to_i - 1) * per_page.to_i
    objects = base_query.offset(offset).limit(per_page)
      .includes(:current_version, :bucket)
      .map(&:to_search_result)
    
    # Generate aggregations
    aggregations = generate_aggregations(query, bucket_id, filters)
    
    {
      total: total,
      objects: objects,
      aggregations: aggregations
    }
  end

  def perform_semantic_search(query, bucket_id, threshold)
    # This would integrate with a vector database like Pinecone or Weaviate
    # For now, we'll implement a simple similarity search based on metadata
    
    base_query = StorageObject.joins(:current_version)
    
    if bucket_id
      base_query = base_query.where(bucket_id: bucket_id)
    else
      base_query = base_query.where(bucket: current_account.buckets)
    end
    
    # Simple semantic search using metadata and content analysis
    # In production, this would use actual embeddings
    objects = base_query.where(
      'object_versions.metadata::text ILIKE ? OR storage_objects.key ILIKE ?',
      "%#{query}%", "%#{query}%"
    ).limit(50).includes(:current_version, :bucket)
      .map(&:to_search_result)
    
    # Calculate similarity scores (mock implementation)
    objects_with_scores = objects.map do |obj|
      score = calculate_similarity_score(obj, query)
      obj.merge(similarity_score: score)
    end.select { |obj| obj[:similarity_score] >= threshold }
      .sort_by { |obj| -obj[:similarity_score] }
    
    {
      total: objects_with_scores.length,
      objects: objects_with_scores
    }
  end

  def generate_suggestions(query, bucket_id, limit)
    base_query = StorageObject
    
    if bucket_id
      base_query = base_query.where(bucket_id: bucket_id)
    else
      base_query = base_query.where(bucket: current_account.buckets)
    end
    
    # Get popular key prefixes and similar objects
    suggestions = []
    
    # Prefix suggestions
    prefixes = base_query.where('key ILIKE ?', "#{query}%")
      .distinct
      .limit(limit / 2)
      .pluck(:key)
      .map { |key| key.split('/').first }
      .uniq
    
    suggestions += prefixes.map { |prefix| { type: 'prefix', value: prefix } }
    
    # Similar object suggestions
    similar = base_query.where('key ILIKE ?', "%#{query}%")
      .order('created_at DESC')
      .limit(limit / 2)
      .pluck(:key)
    
    suggestions += similar.map { |key| { type: 'object', value: key } }
    
    suggestions.take(limit)
  end

  def apply_filters(query, filters)
    query = query.where(object_versions: { content_type: filters[:content_types] }) if filters[:content_types].present?
    query = query.where('object_versions.size >= ?', filters[:size_min]) if filters[:size_min].present?
    query = query.where('object_versions.size <= ?', filters[:size_max]) if filters[:size_max].present?
    query = query.where('storage_objects.created_at >= ?', filters[:date_from]) if filters[:date_from].present?
    query = query.where('storage_objects.created_at <= ?', filters[:date_to]) if filters[:date_to].present?
    
    if filters[:tags].present?
      query = query.where(
        'object_versions.metadata::jsonb ?| array[:tags]',
        tags: filters[:tags]
      )
    end
    
    if filters[:metadata].present?
      filters[:metadata].each do |key, value|
        query = query.where(
          'object_versions.metadata::jsonb ->> ? ILIKE ?',
          key, "%#{value}%"
        )
      end
    end
    
    query
  end

  def apply_sorting(query, sort_by, sort_order)
    case sort_by
    when 'name'
      query.order("storage_objects.key #{sort_order}")
    when 'size'
      query.order("object_versions.size #{sort_order}")
    when 'created_at'
      query.order("storage_objects.created_at #{sort_order}")
    when 'updated_at'
      query.order("storage_objects.updated_at #{sort_order}")
    when 'content_type'
      query.order("object_versions.content_type #{sort_order}")
    else
      query.order("storage_objects.created_at DESC")
    end
  end

  def generate_aggregations(query, bucket_id, filters)
    base_query = StorageObject.joins(:current_version)
    
    if bucket_id
      base_query = base_query.where(bucket_id: bucket_id)
    else
      base_query = base_query.where(bucket: current_account.buckets)
    end
    
    base_query = base_query.where(
      'storage_objects.key ILIKE ? OR object_versions.content ILIKE ?',
      "%#{query}%", "%#{query}%"
    )
    
    base_query = apply_filters(base_query, filters)
    
    {
      content_types: base_query.group('object_versions.content_type')
        .count
        .map { |type, count| { type: type, count: count } }
        .sort_by { |item| -item[:count] }
        .take(10),
      
      size_ranges: {
        small: base_query.where('object_versions.size < ?', 1.megabyte).count,
        medium: base_query.where('object_versions.size >= ? AND object_versions.size < ?', 1.megabyte, 100.megabytes).count,
        large: base_query.where('object_versions.size >= ?', 100.megabytes).count
      },
      
      buckets: base_query.joins(:bucket)
        .group('buckets.name')
        .count
        .map { |name, count| { bucket: name, count: count } }
        .sort_by { |item| -item[:count] }
        .take(10)
    }
  end

  def calculate_similarity_score(object, query)
    # Simple similarity calculation (mock implementation)
    # In production, this would use actual vector embeddings
    score = 0.0
    
    # Key similarity
    key_similarity = similarity(object[:key], query)
    score += key_similarity * 0.4
    
    # Content similarity
    if object[:content]
      content_similarity = similarity(object[:content], query)
      score += content_similarity * 0.4
    end
    
    # Metadata similarity
    if object[:metadata]
      metadata_text = object[:metadata].values.join(' ')
      metadata_similarity = similarity(metadata_text, query)
      score += metadata_similarity * 0.2
    end
    
    score
  end

  def similarity(str1, str2)
    return 0.0 if str1.nil? || str2.nil?
    
    # Simple Jaccard similarity (mock implementation)
    words1 = str1.downcase.split
    words2 = str2.downcase.split
    
    intersection = words1 & words2
    union = words1 | words2
    
    return 0.0 if union.empty?
    
    intersection.length.to_f / union.length
  end

  def get_search_analytics(timeframe)
    # This would typically query a search analytics table
    # For now, return mock data
    {
      timeframe: timeframe,
      total_searches: 1250,
      unique_queries: 342,
      top_queries: [
        { query: 'report', count: 45 },
        { query: 'image', count: 38 },
        { query: 'document', count: 32 },
        { query: 'data', count: 28 },
        { query: 'file', count: 25 }
      ],
      search_trends: [
        { date: 1.day.ago.to_date, searches: 45 },
        { date: 2.days.ago.to_date, searches: 52 },
        { date: 3.days.ago.to_date, searches: 38 },
        { date: 4.days.ago.to_date, searches: 41 },
        { date: 5.days.ago.to_date, searches: 35 }
      ]
    }
  end
end
