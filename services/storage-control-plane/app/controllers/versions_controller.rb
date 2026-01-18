class VersionsController < ApplicationController
  before_action :authenticate_api_key!
  before_action :set_bucket
  before_action :set_object

  # List all versions of an object
  def index
    versions = @object.versions.includes(:storage_object)
      .order(created_at: :desc)
      .map(&:to_version_detail)
    
    render json: {
      object_key: @object.key,
      bucket_name: @bucket.name,
      total_versions: versions.length,
      versions: versions
    }
  end

  # Get specific version details
  def show
    version = @object.versions.find(params[:id])
    
    render json: version.to_version_detail
  end

  # Restore object to specific version
  def restore
    version = @object.versions.find(params[:id])
    
    # Create a new version with the old version's content
    new_version = ObjectVersion.create!(
      storage_object: @object,
      version: @object.next_version_number,
      size: version.size,
      content_type: version.content_type,
      etag: version.etag,
      manifest: version.manifest,
      metadata: version.metadata,
      status: 'active',
      upload_id: version.upload_id,
      chunk_gateway_base_url: version.chunk_gateway_base_url,
      token: version.token,
      ttl_seconds: version.ttl_seconds,
      created_at: Time.current
    )
    
    # Update current version
    @object.update!(current_version_id: new_version.id, updated_at: Time.current)
    
    # Log version restore event
    Event.create!(
      event_type: 'version_restored',
      account_id: current_account.id,
      bucket_id: @bucket.id,
      object_key: @object.key,
      payload: {
        restored_from_version: version.version,
        new_version: new_version.version,
        restored_by: current_api_key.key_prefix
      }
    )
    
    render json: {
      message: 'Object restored successfully',
      object: @object.to_detail,
      restored_from: version.version,
      new_version: new_version.version
    }
  end

  # Compare two versions
  def compare
    version1 = @object.versions.find(params[:version1_id])
    version2 = @object.versions.find(params[:version2_id])
    
    comparison = compare_versions(version1, version2)
    
    render json: {
      version1: version1.to_version_detail,
      version2: version2.to_version_detail,
      comparison: comparison
    }
  end

  # Delete specific version
  def destroy
    version = @object.versions.find(params[:id])
    
    # Cannot delete current version
    if version.id == @object.current_version_id
      render json: { error: 'Cannot delete current version' }, status: :unprocessable_entity
      return
    end
    
    # Cannot delete if it's the only version
    if @object.versions.count == 1
      render json: { error: 'Cannot delete the only version' }, status: :unprocessable_entity
      return
    end
    
    version.destroy!
    
    # Log version deletion event
    Event.create!(
      event_type: 'version_deleted',
      account_id: current_account.id,
      bucket_id: @bucket.id,
      object_key: @object.key,
      payload: {
        deleted_version: version.version,
        deleted_by: current_api_key.key_prefix
      }
    )
    
    render json: {
      message: 'Version deleted successfully',
      deleted_version: version.version
    }
  end

  # Get version history with changes
  def history
    versions = @object.versions.includes(:storage_object)
      .order(created_at: :desc)
    
    history = versions.map.with_index do |version, index|
      previous_version = versions[index + 1]
      
      {
        version: version.to_version_detail,
        changes: previous_version ? calculate_changes(previous_version, version) : {},
        change_summary: summarize_changes(previous_version, version)
      }
    end
    
    render json: {
      object_key: @object.key,
      bucket_name: @bucket.name,
      history: history
    }
  end

  # Create version tag/label
  def tag
    version = @object.versions.find(params[:id])
    tag_name = params[:tag_name]
    tag_description = params[:tag_description]
    
    if tag_name.blank?
      render json: { error: 'Tag name is required' }, status: :bad_request
      return
    end
    
    # Store tag in metadata
    metadata = version.metadata || {}
    tags = metadata['tags'] || {}
    tags[tag_name] = {
      description: tag_description,
      created_at: Time.current.iso8601,
      created_by: current_api_key.key_prefix
    }
    metadata['tags'] = tags
    
    version.update!(metadata: metadata)
    
    render json: {
      message: 'Version tagged successfully',
      version: version.version,
      tag: tag_name,
      metadata: version.metadata
    }
  end

  # Get version analytics
  def analytics
    versions = @object.versions.order(created_at: :desc)
    
    analytics = {
      total_versions: versions.count,
      size_evolution: versions.map { |v| { version: v.version, size: v.size, created_at: v.created_at } },
      content_type_changes: versions.group(:content_type).count,
      version_frequency: calculate_version_frequency(versions),
      storage_impact: calculate_storage_impact(versions)
    }
    
    render json: analytics
  end

  private

  def set_bucket
    @bucket = current_account.buckets.find(params[:bucket_id])
  end

  def set_object
    @object = @bucket.storage_objects.find(params[:object_id])
  end

  def compare_versions(version1, version2)
    differences = {}
    
    # Size comparison
    if version1.size != version2.size
      differences[:size] = {
        version1: version1.size,
        version2: version2.size,
        change: version2.size - version1.size,
        change_percent: ((version2.size.to_f - version1.size) / version1.size * 100).round(2)
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
    
    # Manifest comparison (for multipart uploads)
    if version1.manifest != version2.manifest
      differences[:manifest] = {
        changed: true,
        version1_chunks: version1.manifest&.dig('chunks')&.length || 0,
        version2_chunks: version2.manifest&.dig('chunks')&.length || 0
      }
    end
    
    differences
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

  def calculate_changes(previous_version, current_version)
    changes = {}
    
    if previous_version.size != current_version.size
      changes[:size_change] = current_version.size - previous_version.size
    end
    
    if previous_version.content_type != current_version.content_type
      changes[:content_type_changed] = true
    end
    
    changes
  end

  def summarize_changes(previous_version, current_version)
    summary_parts = []
    
    if previous_version.nil?
      summary_parts << 'Initial version'
      return summary_parts.join(', ')
    end
    
    if previous_version.size != current_version.size
      size_diff = current_version.size - previous_version.size
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

  def calculate_version_frequency(versions)
    return {} if versions.count < 2
    
    # Calculate time between versions
    intervals = []
    versions.each_cons(2) do |prev, curr|
      interval = (curr.created_at - prev.created_at).to_i
      intervals << interval
    end
    
    {
      average_interval: intervals.sum / intervals.length,
      min_interval: intervals.min,
      max_interval: intervals.max,
      total_versions: versions.count,
      time_span: (versions.first.created_at - versions.last.created_at).to_i
    }
  end

  def calculate_storage_impact(versions)
    total_size = versions.sum(&:size)
    current_size = versions.first&.size || 0
    historical_size = total_size - current_size
    
    {
      current_size: current_size,
      historical_size: historical_size,
      total_storage_used: total_size,
      historical_percentage: (historical_size.to_f / total_size * 100).round(2),
      version_count: versions.count
    }
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
