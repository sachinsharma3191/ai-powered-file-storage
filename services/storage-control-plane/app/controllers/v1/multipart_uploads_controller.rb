require "securerandom"

module V1
  class MultipartUploadsController < BaseController
    # Multipart upload (large objects)
    def initiate
      bucket = bucket!
      key = params[:key]

      part_size = (params[:part_size].presence || 5 * 1024 * 1024).to_i
      part_size = 5 * 1024 * 1024 if part_size < 5 * 1024 * 1024

      upload = bucket.multipart_uploads.create!(
        key: key,
        upload_id: SecureRandom.uuid,
        initiated_by: current_api_key.id.to_s,
        status: "initiated",
        part_size: part_size
      )

      # Use new Rust data plane endpoint
      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      # Generate presigned URLs for parts if requested
      presigned_part_urls = []
      if params[:presigned_parts].to_i > 0
        (1..params[:presigned_parts].to_i).each do |part_number|
          token = ScopedTokenIssuer.issue!(
            account_id: current_account.id,
            api_key_id: current_api_key.id,
            region: bucket.region,
            action: "put_part",
            bucket: bucket.name,
            key: key,
            upload_id: upload.upload_id,
            part_number: part_number
          )

          # New endpoint format for Rust data plane
          presigned_part_urls << {
            part_number: part_number,
            upload_url: "#{base_url}/dp/v1/uploads/#{upload.upload_id}/parts/#{part_number}",
            token: token
          }
        end
      end

      render json: {
        bucket: bucket.name,
        key: key,
        upload_id: upload.upload_id,
        part_size: part_size,
        presigned_part_urls: presigned_part_urls,
        ttl_seconds: ScopedTokenIssuer::DEFAULT_TTL_SECONDS
      }, status: :created
    end

    def part_url
      bucket = bucket!
      key = params[:key]
      upload_id = params.require(:upload_id)
      part_number = params.require(:part_number).to_i

      upload = bucket.multipart_uploads.find_by!(upload_id: upload_id)
      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      token = ScopedTokenIssuer.issue!(
        account_id: current_account.id,
        api_key_id: current_api_key.id,
        region: bucket.region,
        action: "put_part",
        bucket: bucket.name,
        key: upload.key,
        upload_id: upload.upload_id,
        part_number: part_number
      )

      # New endpoint format for Rust data plane
      upload_url = "#{base_url}/dp/v1/uploads/#{upload.upload_id}/parts/#{part_number}"

      render json: {
        bucket: bucket.name,
        key: upload.key,
        upload_id: upload.upload_id,
        part_number: part_number,
        upload_url: upload_url,
        token: token,
        ttl_seconds: ScopedTokenIssuer::DEFAULT_TTL_SECONDS
      }
    end

    def complete
      bucket = bucket!
      key = params[:key]
      upload_id = params.require(:upload_id)

      upload = bucket.multipart_uploads.find_by!(upload_id: upload_id)
      
      if upload.status != "initiated"
        render json: { error: "upload_not_initiated" }, status: :bad_request
        return
      end

      if upload.key != key
        render json: { error: "key_mismatch" }, status: :bad_request
        return
      end

      parts_param = params.require(:parts)
      unless parts_param.is_a?(Array) && parts_param.any?
        render json: { error: "invalid_parts" }, status: :bad_request
        return
      end

      content_type = params[:content_type]
      metadata = params[:metadata].presence || {}

      parts_attributes = parts_param.map do |p|
        {
          part_number: (p[:part_number] || p["part_number"]).to_i,
          etag: (p[:etag] || p["etag"]),
          checksum: (p[:checksum] || p["checksum"]),
          size: (p[:size] || p["size"])
        }
      end

      if parts_attributes.any? { |a| a[:part_number] <= 0 }
        render json: { error: "invalid_part_number" }, status: :bad_request
        return
      end

      completed_object = nil

      ActiveRecord::Base.transaction do
        parts_attributes.each do |attrs|
          part = upload.multipart_parts.find_or_initialize_by(part_number: attrs[:part_number])
          part.update!(
            size: attrs[:size],
            etag: attrs[:etag],
            checksum: attrs[:checksum],
            status: "uploaded"
          )
        end

        ordered_parts = upload.multipart_parts.order(:part_number).to_a
        total_size = ordered_parts.sum { |p| p.size.to_i }

        manifest = {
          multipart_upload_id: upload.upload_id,
          parts: ordered_parts.map do |p|
            {
              part_number: p.part_number,
              size: p.size,
              etag: p.etag,
              checksum: p.checksum
            }
          end
        }

        storage_object = bucket.storage_objects.find_or_create_by!(key: key)
        version_string = SecureRandom.uuid

        object_version = storage_object.object_versions.create!(
          version: version_string,
          size: total_size,
          content_type: content_type,
          metadata: metadata,
          status: "available",
          manifest: manifest
        )

        storage_object.update!(current_version_id: object_version.id, deleted_marker: false)
        upload.update!(status: "completed")

        completed_object = storage_object
      end

      render json: {
        bucket: bucket.name,
        key: key,
        object: serialize_object(completed_object.reload)
      }
    end

    def abort
      bucket = bucket!
      key = params[:key]
      upload_id = params.require(:upload_id)

      upload = bucket.multipart_uploads.find_by!(upload_id: upload_id)
      
      if upload.key != key
        render json: { error: "key_mismatch" }, status: :bad_request
        return
      end

      ActiveRecord::Base.transaction do
        upload.update!(status: "aborted")
        upload.multipart_parts.destroy_all
      end

      render json: {
        bucket: bucket.name,
        key: key,
        upload_id: upload.upload_id,
        status: "aborted"
      }
    end

    private

    def serialize_object(o)
      v = o.current_version

      {
        id: o.id,
        key: o.key,
        deleted_marker: o.deleted_marker,
        current_version: v && {
          id: v.id,
          version: v.version,
          size: v.size,
          etag: v.etag,
          content_type: v.content_type,
          metadata: v.metadata,
          status: v.status,
          manifest: v.manifest,
          created_at: v.created_at
        }
      }
    end
  end
end
