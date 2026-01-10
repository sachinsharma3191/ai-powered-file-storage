module V1
  class BucketsController < BaseController
    def index
      buckets = current_account.buckets.order(created_at: :desc)

      render json: {
        buckets: buckets.map { |b| serialize_bucket(b) }
      }
    end

    def create
      name = params.require(:name)
      region = params.require(:region)
      versioning = params[:versioning].presence || "suspended"
      default_encryption = params[:default_encryption].presence || {}

      bucket = current_account.buckets.create!(
        name: name,
        region: region,
        versioning: versioning,
        default_encryption: default_encryption
      )

      render json: { bucket: serialize_bucket(bucket) }, status: :created
    end

    def show
      bucket = current_account.buckets.find_by!(name: params[:bucket_name])
      render json: { bucket: serialize_bucket(bucket) }
    end

    def destroy
      bucket = current_account.buckets.find_by!(name: params[:bucket_name])

      if bucket.storage_objects.where(deleted_marker: false).exists? || bucket.multipart_uploads.where(status: "initiated").exists?
        render json: { error: "bucket_not_empty" }, status: :conflict
        return
      end

      bucket.destroy!
      head :no_content
    end

    def set_policy
      bucket = current_account.buckets.find_by!(name: params[:bucket_name])
      policy = params.require(:policy)
      
      bucket.update!(access_policy: policy)
      render json: { policy: bucket.access_policy }
    end

    def get_policy
      bucket = current_account.buckets.find_by!(name: params[:bucket_name])
      render json: { policy: bucket.access_policy }
    end

    private

    def serialize_bucket(b)
      {
        id: b.id,
        name: b.name,
        region: b.region,
        versioning: b.versioning,
        default_encryption: b.default_encryption,
        access_policy: b.access_policy,
        created_at: b.created_at
      }
    end
  end
end
