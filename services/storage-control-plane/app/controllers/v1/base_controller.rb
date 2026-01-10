module V1
  class BaseController < ApplicationController
    include ApiKeyAuthentication

    private

    def bucket_name_param
      params[:bucket_name].presence || params[:bucket_bucket_name].presence
    end

    def bucket!
      current_account.buckets.find_by!(name: bucket_name_param)
    end

    def chunk_gateway_base_url_for!(region)
      base_url = ChunkGatewayLocator.base_url_for(region)
      if base_url.blank?
        render json: { error: "chunk_gateway_unavailable", region: region }, status: :service_unavailable
        return nil
      end

      base_url
    end
  end
end
