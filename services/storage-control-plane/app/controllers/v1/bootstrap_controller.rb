module V1
  class BootstrapController < ApplicationController
    def create
      unless bootstrap_allowed?
        render json: { error: "bootstrap_not_allowed" }, status: :forbidden
        return
      end

      plan = params[:plan].presence || "free"
      api_key_name = params[:api_key_name].presence || "default"
      scopes = params[:scopes].presence || {}

      account = Account.create!(plan: plan)
      api_key, plaintext = ApiKey.generate_for!(account: account, name: api_key_name, scopes: scopes)

      render json: {
        account: { id: account.id, plan: account.plan },
        api_key: { id: api_key.id, name: api_key.name, status: api_key.status, scopes: api_key.scopes },
        plaintext_api_key: plaintext
      }, status: :created
    end

    private

    def bootstrap_allowed?
      return true if Rails.env.development? || Rails.env.test?

      expected = ENV["BOOTSTRAP_TOKEN"].to_s
      provided = request.headers["X-Bootstrap-Token"].to_s

      return false if expected.blank? || provided.blank?
      return false unless expected.bytesize == provided.bytesize

      ActiveSupport::SecurityUtils.secure_compare(expected, provided)
    end
  end
end
