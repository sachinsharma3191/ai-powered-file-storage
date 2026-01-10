module V1
  class ScopedTokensController < BaseController
    ALLOWED_ACTIONS = %w[
      put_object
      get_object
      upload_part
    ].freeze

    def create
      action_name = scoped_action_param

      unless ALLOWED_ACTIONS.include?(action_name)
        render json: { error: "invalid_action" }, status: :unprocessable_entity
        return
      end

      bucket_name = params.require(:bucket)
      bucket = current_account.buckets.find_by!(name: bucket_name)

      ttl_seconds = (params[:ttl_seconds].presence || ScopedTokenIssuer::DEFAULT_TTL_SECONDS).to_i
      ttl_seconds = ScopedTokenIssuer::DEFAULT_TTL_SECONDS if ttl_seconds <= 0
      ttl_seconds = 60 * 60 if ttl_seconds > 60 * 60

      base_url = chunk_gateway_base_url_for!(bucket.region)
      return if performed?

      token = ScopedTokenIssuer.issue!(
        account_id: current_account.id,
        api_key_id: current_api_key.id,
        region: bucket.region,
        action: action_name,
        bucket: bucket.name,
        key: params[:key],
        upload_id: params[:upload_id],
        part_number: params[:part_number],
        ttl_seconds: ttl_seconds
      )

      render json: {
        action: action_name,
        bucket: bucket.name,
        key: params[:key],
        upload_id: params[:upload_id],
        part_number: params[:part_number],
        region: bucket.region,
        chunk_gateway_base_url: base_url,
        token: token,
        ttl_seconds: ttl_seconds
      }, status: :created
    end

    private

    def scoped_action_param
      value = request.request_parameters["action"].presence ||
        request.request_parameters["act"].presence ||
        params[:act].presence ||
        request.request_parameters["scoped_action"].presence ||
        params[:scoped_action].presence

      value || (raise ActionController::ParameterMissing, :act)
    end
  end
end
