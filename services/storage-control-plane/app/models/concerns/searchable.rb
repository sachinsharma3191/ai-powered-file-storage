module Searchable
  extend ActiveSupport::Concern

  class_methods do
    def search(query, filters = {}, sort_by = 'created_at', sort_order = 'desc', page = 1, per_page = 20)
      scope = all
      
      # Apply text search
      if query.present?
        scope = scope.where(
          'storage_objects.key ILIKE ? OR object_versions.content ILIKE ?',
          "%#{query}%", "%#{query}%"
        )
      end
      
      # Apply filters
      scope = apply_search_filters(scope, filters)
      
      # Count total results
      total = scope.count
      
      # Apply sorting
      scope = apply_search_sorting(scope, sort_by, sort_order)
      
      # Apply pagination
      offset = (page.to_i - 1) * per_page.to_i
      objects = scope.offset(offset).limit(per_page)
        .includes(:current_version, :bucket)
      
      {
        total: total,
        objects: objects.map(&:to_search_result),
        aggregations: generate_search_aggregations(query, filters)
      }
    end

    private

    def apply_search_filters(scope, filters)
      scope = scope.where(object_versions: { content_type: filters[:content_types] }) if filters[:content_types]&.any?
      scope = scope.where('object_versions.size >= ?', filters[:size_min]) if filters[:size_min]
      scope = scope.where('object_versions.size <= ?', filters[:size_max]) if filters[:size_max]
      scope = scope.where('storage_objects.created_at >= ?', filters[:date_from]) if filters[:date_from]
      scope = scope.where('storage_objects.created_at <= ?', filters[:date_to]) if filters[:date_to]
      
      if filters[:tags]&.any?
        scope = scope.where(
          'object_versions.metadata::jsonb ?| array[:tags]',
          tags: filters[:tags]
        )
      end
      
      if filters[:metadata]&.any?
        filters[:metadata].each do |key, value|
          scope = scope.where(
            'object_versions.metadata::jsonb ->> ? ILIKE ?',
            key, "%#{value}%"
          )
        end
      end
      
      scope
    end

    def apply_search_sorting(scope, sort_by, sort_order)
      case sort_by
      when 'name'
        scope.order("storage_objects.key #{sort_order}")
      when 'size'
        scope.order("object_versions.size #{sort_order}")
      when 'created_at'
        scope.order("storage_objects.created_at #{sort_order}")
      when 'updated_at'
        scope.order("storage_objects.updated_at #{sort_order}")
      when 'content_type'
        scope.order("object_versions.content_type #{sort_order}")
      else
        scope.order("storage_objects.created_at DESC")
      end
    end

    def generate_search_aggregations(query, filters)
      scope = all
      
      if query.present?
        scope = scope.where(
          'storage_objects.key ILIKE ? OR object_versions.content ILIKE ?',
          "%#{query}%", "%#{query}%"
        )
      end
      
      scope = apply_search_filters(scope, filters)
      
      {
        content_types: scope.group('object_versions.content_type')
          .count
          .map { |type, count| { type: type, count: count } }
          .sort_by { |item| -item[:count] }
          .take(10),
        
        size_ranges: {
          small: scope.where('object_versions.size < ?', 1.megabyte).count,
          medium: scope.where('object_versions.size >= ? AND object_versions.size < ?', 1.megabyte, 100.megabytes).count,
          large: scope.where('object_versions.size >= ?', 100.megabytes).count
        },
        
        buckets: scope.joins(:bucket)
          .group('buckets.name')
          .count
          .map { |name, count| { bucket: name, count: count } }
          .sort_by { |item| -item[:count] }
          .take(10)
      }
    end
  end

  def to_search_result
    {
      id: id,
      key: key,
      bucket_name: bucket.name,
      size: current_version&.size || 0,
      content_type: current_version&.content_type,
      etag: current_version&.etag,
      created_at: created_at.iso8601,
      updated_at: updated_at.iso8601,
      metadata: current_version&.metadata
    }
  end

  def to_version_detail
    {
      id: id,
      version: version,
      size: size,
      content_type: content_type,
      etag: etag,
      created_at: created_at.iso8601,
      updated_at: updated_at.iso8601,
      metadata: metadata,
      manifest: manifest,
      status: status,
      upload_id: upload_id,
      chunk_gateway_base_url: chunk_gateway_base_url,
      token: token,
      ttl_seconds: ttl_seconds,
      is_current: storage_object.current_version_id == id
    }
  end
end
