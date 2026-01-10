module V1
  class ApiKeysController < BaseController
    def index
      keys = current_account.api_keys.order(created_at: :desc)

      render json: {
        api_keys: keys.map { |k| serialize_api_key(k) }
      }
    end

    def create
      name = params.require(:name)
      scopes = params[:scopes].presence || {}

      record, plaintext = ApiKey.generate_for!(account: current_account, name: name, scopes: scopes)

      render json: {
        api_key: serialize_api_key(record),
        plaintext_api_key: plaintext
      }, status: :created
    end

    def activate
      api_key = current_account.api_keys.find(params[:id])
      
      # Deactivate all other keys for this account
      current_account.api_keys.where.not(id: api_key.id).update_all(status: 'inactive')
      
      # Activate this key
      api_key.update!(status: 'active')
      
      render json: {
        api_key: serialize_api_key(api_key)
      }
    end

    private

    def serialize_api_key(k)
      {
        id: k.id,
        name: k.name,
        status: k.status,
        scopes: k.scopes,
        created_at: k.created_at
      }
    end
  end
end
