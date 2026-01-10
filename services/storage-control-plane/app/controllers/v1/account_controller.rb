module V1
  class AccountController < ApplicationController
    include ApiKeyAuthentication
    before_action :authenticate_user!, only: [:create_api_key]

    def show
      response = {
        id: Current.account.id,
        plan: Current.account.plan,
        created_at: Current.account.created_at
      }
      
      # Only include api_key if it exists (for API key authentication)
      if Current.api_key.present?
        response[:api_key] = {
          id: Current.api_key.id,
          name: Current.api_key.name,
          status: Current.api_key.status,
          created_at: Current.api_key.created_at
        }
      end
      
      render json: response
    end

    def update_plan
      new_plan = params[:plan]
      valid_plans = %w[free pro enterprise]
      
      unless valid_plans.include?(new_plan)
        render json: { error: "Invalid plan. Must be one of: #{valid_plans.join(', ')}" }, status: :unprocessable_entity
        return
      end

      Current.account.update!(plan: new_plan)
      render json: { message: "Plan updated to #{new_plan}" }
    end

    def api_keys
      keys = Current.account.api_keys.map do |key|
        {
          id: key.id,
          name: key.name,
          status: key.status,
          scopes: key.scopes,
          created_at: key.created_at
        }
      end
      render json: keys
    end

    def create_api_key
      api_key, plaintext = ApiKey.generate_for!(
        account: Current.account,
        name: params[:name],
        scopes: params[:scopes] || {}
      )

      render json: {
        api_key: {
          id: api_key.id,
          name: api_key.name,
          status: api_key.status,
          scopes: api_key.scopes,
          created_at: api_key.created_at
        },
        plaintext_key: plaintext
      }, status: :created
    end

    def revoke_api_key
      api_key = Current.account.api_keys.find(params[:key_id])
      
      if api_key.id == Current.api_key.id
        render json: { error: "Cannot revoke your current API key" }, status: :unprocessable_entity
        return
      end

      api_key.update!(status: "revoked")
      render json: { message: "API key revoked" }
    end

    def activate_api_key
      api_key = Current.account.api_keys.find(params[:key_id])
      
      # Deactivate all other keys for this account
      Current.account.api_keys.where.not(id: api_key.id).update_all(status: 'inactive')
      
      # Activate this key
      api_key.update!(status: 'active')
      
      render json: {
        api_key: {
          id: api_key.id,
          name: api_key.name,
          status: api_key.status,
          scopes: api_key.scopes,
          created_at: api_key.created_at
        }
      }
    end

    private

    def authenticate_user!
      token = request.headers['Authorization']&.gsub('Bearer ', '')
      user = User.find_by(session_token: token)
      
      unless user
        render json: { error: 'Invalid session token' }, status: :unauthorized
        return
      end

      Current.account = user.account
    end
  end
end
