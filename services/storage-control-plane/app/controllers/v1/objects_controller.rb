require "securerandom"

module V1
  class ObjectsController < BaseController
    def index
      bucket = bucket!
      scope = bucket.storage_objects.where(deleted_marker: false)

      prefix = params[:prefix].presence
      if prefix
        scope = scope.where("key LIKE ?", "#{ActiveRecord::Base.sanitize_sql_like(prefix)}%")
      end

      after = params[:after].presence
      if after
        scope = scope.where("key > ?", after)
      end

      limit = (params[:limit].presence || 100).to_i
      limit = 1 if limit < 1
      limit = 1000 if limit > 1000

      objects = scope.includes(:current_version).order(:key).limit(limit)

      render json: {
        bucket: bucket.name,
        objects: objects.map { |o| serialize_object(o) }
      }
    end

    def show
      bucket = bucket!
      key = params.require(:key)

      object = bucket.storage_objects.includes(:current_version).find_by!(key: key)

      render json: {
        bucket: bucket.name,
        object: serialize_object(object)
      }
    end

    def create
      bucket = bucket!
      key = params.require(:key)
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

      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      token = ScopedTokenIssuer.issue!(
        account_id: current_account.id,
        api_key_id: current_api_key.id,
        region: bucket.region,
        action: "put_object",
        bucket: bucket.name,
        key: key
      )

      render json: {
        bucket: bucket.name,
        key: key,
        version: object_version.version,
        object_version_id: object_version.id,
        chunk_gateway_base_url: base_url,
        token: token,
        ttl_seconds: ScopedTokenIssuer::DEFAULT_TTL_SECONDS
      }, status: :created
    end

    def complete
      bucket = bucket!
      key = params.require(:key)
      version_string = params.require(:version)

      storage_object = bucket.storage_objects.find_by!(key: key)
      object_version = storage_object.object_versions.find_by!(version: version_string)

      size = params[:size]
      etag = params[:etag]
      manifest = params[:manifest].presence || {}

      ActiveRecord::Base.transaction do
        object_version.update!(
          status: "available",
          size: size,
          etag: etag,
          manifest: manifest
        )

        storage_object.update!(
          current_version_id: object_version.id,
          deleted_marker: false
        )
      end

      render json: {
        bucket: bucket.name,
        object: serialize_object(storage_object.reload)
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
        content_type: v.content_type,
        metadata: v.metadata,
        status: v.status,
        manifest: v.manifest,
        created_at: v.created_at
      }
    end
  end
end
