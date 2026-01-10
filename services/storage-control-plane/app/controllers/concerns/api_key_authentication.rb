require "digest"
require "openssl"

module ApiKeyAuthentication
  extend ActiveSupport::Concern

  included do
    before_action :authenticate_api_key!
  end

  private

  def authenticate_api_key!
    # First try API key authentication
    plaintext = request.headers["X-Api-Key"].presence

    if plaintext.blank?
      auth = request.headers["Authorization"].to_s
      scheme, value = auth.split(/\s+/, 2)
      plaintext = value if value.present? && scheme.in?(["Bearer", "ApiKey"])
    end

    if plaintext.present?
      key_hash = ApiKey.hash_for(plaintext)
      api_key = ApiKey.includes(:account).find_by(key_hash: key_hash, status: "active")

      if api_key.present?
        Current.account = api_key.account
        Current.api_key = api_key
        return
      end
    end

    # If API key authentication fails, try session authentication
    user = authenticate_user_from_token
    if user
      Current.account = user.account
      Current.api_key = nil
    else
      render json: { error: "invalid_api_key" }, status: :unauthorized
      return
    end
  end

  def authenticate_user_from_token
    token = request.headers['Authorization']&.gsub('Bearer ', '')
    User.find_by(session_token: token) if token.present?
  end

  def current_account
    Current.account
  end

  def current_api_key
    Current.api_key
  end
end
