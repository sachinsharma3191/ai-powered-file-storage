require "securerandom"

module V1
  class MultipartUploadsController < BaseController
    def create
      bucket = bucket!
      key = params.require(:key)

      part_size = (params[:part_size].presence || 5 * 1024 * 1024).to_i
      part_size = 5 * 1024 * 1024 if part_size < 5 * 1024 * 1024

      upload = bucket.multipart_uploads.create!(
        key: key,
        upload_id: SecureRandom.uuid,
        initiated_by: current_api_key.id.to_s,
        status: "initiated",
        part_size: part_size
      )

      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      render json: {
        multipart_upload: serialize_upload(upload),
        chunk_gateway_base_url: base_url
      }, status: :created
    end

    def show
      bucket = bucket!
      upload = bucket.multipart_uploads.find_by!(upload_id: params[:upload_id])

      render json: {
        multipart_upload: serialize_upload(upload)
      }
    end

    def abort
      bucket = bucket!
      upload = bucket.multipart_uploads.find_by!(upload_id: params[:upload_id])

      ActiveRecord::Base.transaction do
        upload.update!(status: "aborted")
        upload.multipart_parts.destroy_all
      end

      render json: {
        multipart_upload: serialize_upload(upload)
      }
    end

    def complete
      bucket = bucket!
      upload = bucket.multipart_uploads.find_by!(upload_id: params[:upload_id])

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
          size: (p[:size] || p["size"]),
          chunk_manifest: (p[:chunk_manifest] || p["chunk_manifest"])
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
            chunk_manifest: attrs[:chunk_manifest].presence || part.chunk_manifest,
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
              checksum: p.checksum,
              chunk_manifest: p.chunk_manifest
            }
          end
        }

        storage_object = bucket.storage_objects.find_or_create_by!(key: upload.key)
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
        key: upload.key,
        object: serialize_object(completed_object.reload)
      }
    end

    private

    def serialize_upload(u)
      {
        id: u.id,
        key: u.key,
        upload_id: u.upload_id,
        status: u.status,
        part_size: u.part_size,
        initiated_by: u.initiated_by,
        created_at: u.created_at
      }
    end

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
