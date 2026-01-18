module Versionable
  extend ActiveSupport::Concern

  def next_version_number
    (versions.maximum(:version) || 0) + 1
  end

  def create_new_version(attributes = {})
    version = versions.create!(
      version: next_version_number,
      **attributes
    )
    
    # Update current version
    update!(current_version: version, updated_at: Time.current)
    
    version
  end

  def restore_to_version(target_version)
    # Create a new version with the old version's content
    new_version = versions.create!(
      version: next_version_number,
      size: target_version.size,
      content_type: target_version.content_type,
      etag: target_version.etag,
      manifest: target_version.manifest,
      metadata: target_version.metadata,
      status: 'active',
      upload_id: target_version.upload_id,
      chunk_gateway_base_url: target_version.chunk_gateway_base_url,
      token: target_version.token,
      ttl_seconds: target_version.ttl_seconds
    )
    
    # Update current version
    update!(current_version: new_version, updated_at: Time.current)
    
    new_version
  end

  def version_history
    versions.includes(:storage_object)
      .order(created_at: :desc)
      .map.with_index do |version, index|
        previous_version = versions[index + 1]
        
        {
          version: version.to_version_detail,
          changes: calculate_version_changes(previous_version, version),
          change_summary: summarize_version_changes(previous_version, version)
        }
      end
  end

  def version_analytics
    versions_order = versions.order(created_at: :asc)
    
    {
      total_versions: versions_order.count,
      size_evolution: versions_order.map { |v| 
        { 
          version: v.version, 
          size: v.size, 
          created_at: v.created_at.iso8601 
        } 
      },
      content_type_changes: versions_order.group(:content_type).count,
      version_frequency: calculate_version_frequency(versions_order),
      storage_impact: calculate_storage_impact(versions_order)
    }
  end

  def compare_versions(version1, version2)
    differences = {}
    
    # Size comparison
    if version1.size != version2.size
      differences[:size] = {
        version1: version1.size,
        version2: version2.size,
        change: version2.size - version1.size,
        change_percent: calculate_percentage_change(version1.size, version2.size)
      }
    end
    
    # Content type comparison
    if version1.content_type != version2.content_type
      differences[:content_type] = {
        version1: version1.content_type,
        version2: version2.content_type
      }
    end
    
    # Metadata comparison
    metadata_diff = compare_metadata(version1.metadata || {}, version2.metadata || {})
    differences[:metadata] = metadata_diff if metadata_diff.any?
    
    # Manifest comparison
    if version1.manifest != version2.manifest
      differences[:manifest] = {
        changed: true,
        version1_chunks: version1.manifest&.dig('chunks')&.length || 0,
        version2_chunks: version2.manifest&.dig('chunks')&.length || 0
      }
    end
    
    differences
  end

  def tag_version(version, tag_name, tag_description = nil)
    metadata = version.metadata || {}
    tags = metadata['tags'] || {}
    tags[tag_name] = {
      description: tag_description,
      created_at: Time.current.iso8601,
      created_by: 'user' # This would come from current_user in real implementation
    }
    metadata['tags'] = tags
    
    version.update!(metadata: metadata)
  end

  def get_version_tags(version)
    return [] unless version.metadata&.dig('tags')
    
    version.metadata['tags'].map do |name, info|
      {
        name: name,
        description: info['description'],
        created_at: info['created_at'],
        created_by: info['created_by']
      }
    end
  end

  def can_delete_version?(version)
    # Cannot delete current version
    return false if version.id == current_version_id
    
    # Cannot delete if it's the only version
    return false if versions.count == 1
    
    true
  end

  def can_restore_version?(version)
    # Can restore any version except current
    version.id != current_version_id
  end

  private

  def calculate_version_changes(previous_version, current_version)
    changes = {}
    
    return changes unless previous_version
    
    if previous_version.size != current_version.size
      changes[:size_change] = current_version.size - previous_version.size
    end
    
    if previous_version.content_type != current_version.content_type
      changes[:content_type_changed] = true
    end
    
    changes
  end

  def summarize_version_changes(previous_version, current_version)
    summary_parts = []
    
    if previous_version.nil?
      summary_parts << 'Initial version'
      return summary_parts.join(', ')
    end
    
    size_diff = current_version.size - previous_version.size
    if size_diff != 0
      if size_diff > 0
        summary_parts << "Size increased by #{format_bytes(size_diff)}"
      else
        summary_parts << "Size decreased by #{format_bytes(-size_diff)}"
      end
    end
    
    if previous_version.content_type != current_version.content_type
      summary_parts << 'Content type changed'
    end
    
    if previous_version.metadata != current_version.metadata
      summary_parts << 'Metadata updated'
    end
    
    summary_parts.empty? ? 'No changes' : summary_parts.join(', ')
  end

  def calculate_version_frequency(versions_order)
    return {} if versions_order.count < 2
    
    # Calculate time between versions
    intervals = []
    versions_order.each_cons(2) do |prev, curr|
      interval = (curr.created_at - prev.created_at).to_i
      intervals << interval
    end
    
    {
      average_interval: intervals.sum / intervals.length,
      min_interval: intervals.min,
      max_interval: intervals.max,
      total_versions: versions_order.count,
      time_span: (versions_order.last.created_at - versions_order.first.created_at).to_i
    }
  end

  def calculate_storage_impact(versions_order)
    total_size = versions_order.sum(&:size)
    current_size = versions_order.last&.size || 0
    historical_size = total_size - current_size
    
    {
      current_size: current_size,
      historical_size: historical_size,
      total_storage_used: total_size,
      historical_percentage: calculate_percentage_change(historical_size, total_size),
      version_count: versions_order.count
    }
  end

  def compare_metadata(metadata1, metadata2)
    all_keys = (metadata1.keys + metadata2.keys).uniq
    differences = {}
    
    all_keys.each do |key|
      value1 = metadata1[key]
      value2 = metadata2[key]
      
      if value1 != value2
        differences[key] = {
          version1: value1,
          version2: value2
        }
      end
    end
    
    differences
  end

  def calculate_percentage_change(old_value, new_value)
    return 0.0 if old_value == 0
    
    ((new_value.to_f - old_value) / old_value * 100).round(2)
  end

  def format_bytes(bytes)
    if bytes < 1024
      "#{bytes} B"
    elsif bytes < 1024 * 1024
      "#{(bytes / 1024.0).round(2)} KB"
    elsif bytes < 1024 * 1024 * 1024
      "#{(bytes / 1024.0 / 1024.0).round(2)} MB"
    else
      "#{(bytes / 1024.0 / 1024.0 / 1024.0).round(2)} GB"
    end
  end
end
