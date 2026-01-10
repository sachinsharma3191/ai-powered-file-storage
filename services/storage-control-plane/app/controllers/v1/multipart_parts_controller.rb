module V1
  class MultipartPartsController < BaseController
    def index
      bucket = bucket!
      upload = bucket.multipart_uploads.find_by!(upload_id: params[:upload_id])
      parts = upload.multipart_parts.order(:part_number)

      render json: {
        multipart_upload: { upload_id: upload.upload_id, key: upload.key, status: upload.status },
        parts: parts.map { |p| serialize_part(p) }
      }
    end

    def upsert
      bucket = bucket!
      upload = bucket.multipart_uploads.find_by!(upload_id: params[:upload_id])

      part_number = params[:part_number].to_i
      if part_number <= 0
        render json: { error: "invalid_part_number" }, status: :bad_request
        return
      end

      part = upload.multipart_parts.find_or_initialize_by(part_number: part_number)

      if part.new_record?
        part.status = "pending"
        part.save!
      end

      attrs = {}
      attrs[:size] = params[:size] if params.key?(:size)
      attrs[:etag] = params[:etag] if params.key?(:etag)
      attrs[:checksum] = params[:checksum] if params.key?(:checksum)
      attrs[:chunk_manifest] = params[:chunk_manifest] if params.key?(:chunk_manifest)
      attrs[:status] = params[:status] if params.key?(:status)

      part.update!(attrs) if attrs.any?

      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      token = ScopedTokenIssuer.issue!(
        account_id: current_account.id,
        api_key_id: current_api_key.id,
        region: bucket.region,
        action: "upload_part",
        bucket: bucket.name,
        key: upload.key,
        upload_id: upload.upload_id,
        part_number: part_number
      )

      render json: {
        multipart_upload: { upload_id: upload.upload_id, key: upload.key },
        part: serialize_part(part.reload),
        chunk_gateway_base_url: base_url,
        token: token,
        ttl_seconds: ScopedTokenIssuer::DEFAULT_TTL_SECONDS
      }
    end

    private

    def serialize_part(p)
      {
        id: p.id,
        part_number: p.part_number,
        size: p.size,
        etag: p.etag,
        checksum: p.checksum,
        chunk_manifest: p.chunk_manifest,
        status: p.status,
        created_at: p.created_at
      }
    end
  end
end
