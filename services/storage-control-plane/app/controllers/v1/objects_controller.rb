require "securerandom"

module V1
  class ObjectsController < BaseController
    # Objects (metadata + listing)
    def index
      bucket = bucket!
      scope = bucket.storage_objects.where(deleted_marker: false)

      prefix = params[:prefix].presence
      delimiter = params[:delimiter].presence
      
      if prefix
        scope = scope.where("key LIKE ?", "#{ActiveRecord::Base.sanitize_sql_like(prefix)}%")
      end

      cursor = params[:cursor].presence
      if cursor
        scope = scope.where("key > ?", cursor)
      end

      limit = (params[:limit].presence || 100).to_i
      limit = 1 if limit < 1
      limit = 1000 if limit > 1000

      # Handle delimiter for folder simulation
      if delimiter
        objects = []
        common_prefixes = Set.new
        
        # Get all keys up to limit + extra to find common prefixes
        all_objects = scope.select(:key).order(:key).limit(limit * 2).pluck(:key)
        
        all_objects.each do |key|
          # Remove prefix for comparison
          relative_key = key.sub(/^#{Regexp.escape(prefix.to_s)}/, '')
          
          if delimiter && relative_key.include?(delimiter)
            # Extract common prefix up to delimiter
            common_prefix = prefix + relative_key.split(delimiter).first + delimiter
            common_prefixes.add(common_prefix) if common_prefixes.size < limit
          else
            objects << bucket.storage_objects.includes(:current_version).find_by!(key: key)
            break if objects.size >= limit
          end
        end
        
        has_more = (objects.size >= limit) || (common_prefixes.size >= limit) || 
                  (all_objects.size > (objects.size + common_prefixes.size))
        next_cursor = objects.last&.key if objects.any? && has_more
        
        render json: {
          bucket: bucket.name,
          objects: objects.map { |o| serialize_object(o) },
          common_prefixes: common_prefixes.to_a.sort,
          delimiter: delimiter,
          prefix: prefix,
          cursor: next_cursor,
          has_more: has_more
        }
      else
        # Original behavior without delimiter
        objects = scope.includes(:current_version).order(:key).limit(limit + 1)
        
        has_more = objects.length > limit
        objects = objects.first(limit) if has_more

        next_cursor = objects.last&.key if has_more

        render json: {
          bucket: bucket.name,
          objects: objects.map { |o| serialize_object(o) },
          cursor: next_cursor,
          has_more: has_more
        }
      end
    end

    def head
      bucket = bucket!
      key = params[:key]

      object = bucket.storage_objects.includes(:current_version).find_by!(key: key)
      version = params[:version].presence ? object.object_versions.find_by!(version: params[:version]) : object.current_version

      unless version
        head :not_found
        return
      end

      response.headers["ETag"] = version.etag if version.etag
      response.headers["Content-Length"] = version.size.to_s if version.size
      response.headers["X-Object-Version"] = version.version
      response.headers["Content-Type"] = version.content_type if version.content_type
      response.headers["Last-Modified"] = version.created_at.httpdate

      head :ok
    end

    def destroy
      bucket = bucket!
      key = params[:key]
      version = params[:version].presence

      object = bucket.storage_objects.find_by!(key: key)
      
      if version
        # Delete specific version
        target_version = object.object_versions.find_by!(version: version)
        if target_version == object.current_version
          # Can't delete current version if there are other versions
          if object.object_versions.where.not(id: target_version.id).exists?
            render json: { error: "cannot_delete_current_version" }, status: :conflict
            return
          end
          # Delete the object entirely
          object.update!(deleted_marker: true, current_version_id: nil)
        end
        target_version.destroy!
      else
        # Soft delete with versioning
        if bucket.versioning == "enabled"
          # Create delete marker
          delete_marker = object.object_versions.create!(
            version: SecureRandom.uuid,
            content_type: "application/x-delete-marker",
            metadata: {},
            status: "available",
            size: 0,
            etag: "delete-marker"
          )
          object.update!(current_version_id: delete_marker.id, deleted_marker: true)
        else
          # Hard delete
          object.object_versions.destroy_all
          object.update!(deleted_marker: true, current_version_id: nil)
        end
      end

      head :no_content
    end

    # Simple upload (small objects)
    def init_upload
      bucket = bucket!
      key = params[:key]
      content_type = params[:content_type]
      metadata = params[:metadata].presence || {}

      storage_object = bucket.storage_objects.find_or_create_by!(key: key)
      storage_object.update!(deleted_marker: false) if storage_object.deleted_marker?

      version_string = SecureRandom.uuid
      object_version = storage_object.object_versions.create!(
        version: version_string,
        content_type: content_type,
        metadata: metadata,
        status: "pending"
      )

      # Use new Rust data plane endpoint
      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      token = ScopedTokenIssuer.issue!(
        account_id: current_account.id,
        api_key_id: current_api_key.id,
        region: bucket.region,
        action: "put_object",
        bucket: bucket.name,
        key: key,
        version: version_string
      )

      # New endpoint format for Rust data plane
      upload_url = "#{base_url}/dp/v1/objects/#{object_version.id}"

      render json: {
        bucket: bucket.name,
        key: key,
        version: object_version.version,
        object_version_id: object_version.id,
        upload_url: upload_url,
        token: token,
        ttl_seconds: ScopedTokenIssuer::DEFAULT_TTL_SECONDS
      }, status: :created
    end

    def finalize_upload
      bucket = bucket!
      key = params[:key]
      version_string = params.require(:version)

      storage_object = bucket.storage_objects.find_by!(key: key)
      object_version = storage_object.object_versions.find_by!(version: version_string)

      size = params.require(:size)
      etag = params.require(:etag)
      checksum = params[:checksum]
      manifest = params[:manifest].presence || {}

      ActiveRecord::Base.transaction do
        object_version.update!(
          status: "available",
          size: size,
          etag: etag,
          checksum: checksum,
          manifest: manifest
        )

        storage_object.update!(
          current_version_id: object_version.id,
          deleted_marker: false
        )
      end

      render json: {
        bucket: bucket.name,
        key: key,
        object: serialize_object(storage_object.reload)
      }
    end

    # Download
    def download_url
      bucket = bucket!
      key = params[:key]
      version = params[:version].presence

      object = bucket.storage_objects.find_by!(key: key)
      target_version = version ? object.object_versions.find_by!(version: version) : object.current_version

      unless target_version
        render json: { error: "object_not_found" }, status: :not_found
        return
      end

      # Use new Rust data plane endpoint
      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      token = ScopedTokenIssuer.issue!(
        account_id: current_account.id,
        api_key_id: current_api_key.id,
        region: bucket.region,
        action: "get_object",
        bucket: bucket.name,
        key: key,
        version: target_version.version
      )

      # New endpoint format for Rust data plane
      download_url = "#{base_url}/dp/v1/objects/#{target_version.id}"

      render json: {
        bucket: bucket.name,
        key: key,
        version: target_version.version,
        object_version_id: target_version.id,
        download_url: download_url,
        token: token,
        ttl_seconds: ScopedTokenIssuer::DEFAULT_TTL_SECONDS
      }
    end

    private

    def serialize_object(o)
      v = o.current_version

      {
        id: o.id,
        key: o.key,
        deleted_marker: o.deleted_marker,
        current_version: v && serialize_version(v)
      }
    end

    def serialize_version(v)
      {
        id: v.id,
        version: v.version,
        size: v.size,
        etag: v.etag,
        checksum: v.checksum,
        content_type: v.content_type,
        metadata: v.metadata,
        status: v.status,
        manifest: v.manifest,
        created_at: v.created_at
      }
    end
  end
end
