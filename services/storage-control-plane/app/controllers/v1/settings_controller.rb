module V1
  class SettingsController < ApplicationController
    include ApiKeyAuthentication
    before_action :authenticate_api_key!

    def index
      settings = Current.account.settings.map do |s|
        { key: s.key, value: s.display_value, secret: s.secret, updated_at: s.updated_at }
      end
      render json: settings
    end

    def show
      setting = Current.account.settings.find_by!(key: params[:id])
      render json: {
        key: setting.key,
        value: setting.display_value,
        secret: setting.secret,
        updated_at: setting.updated_at
      }
    end

    def update
      Setting.set(Current.account, params[:id], params[:value], secret: params[:secret])
      render json: { message: "Setting updated" }
    end

    def destroy
      setting = Current.account.settings.find_by!(key: params[:id])
      setting.destroy!
      render json: { message: "Setting deleted" }
    end

    def ollama
      config = Setting.ollama_config(Current.account)
      render json: {
        url: config[:url],
        model: config[:model],
        has_api_key: config[:api_key].present?
      }
    end

    def update_ollama
      Setting.set(Current.account, "ollama_url", params[:url]) if params[:url].present?
      Setting.set(Current.account, "ollama_model", params[:model]) if params[:model].present?
      Setting.set(Current.account, "ollama_api_key", params[:api_key]) if params[:api_key].present?

      render json: { message: "Ollama settings updated" }
    end

    def available_models
      config = Setting.ollama_config(Current.account)
      
      begin
        response = Net::HTTP.get_response(URI("#{config[:url]}/api/tags"))
        if response.is_a?(Net::HTTPSuccess)
          data = JSON.parse(response.body)
          models = data["models"]&.map { |m| m["name"] } || []
          render json: { models: models, connected: true }
        else
          render json: { models: [], connected: false, error: "Failed to connect to Ollama" }
        end
      rescue => e
        render json: { models: [], connected: false, error: e.message }
      end
    end

    def pull_model
      config = Setting.ollama_config(Current.account)
      model_name = params[:model]

      begin
        uri = URI("#{config[:url]}/api/pull")
        http = Net::HTTP.new(uri.host, uri.port)
        http.read_timeout = 300

        request = Net::HTTP::Post.new(uri)
        request["Content-Type"] = "application/json"
        request.body = { name: model_name, stream: false }.to_json

        response = http.request(request)

        if response.is_a?(Net::HTTPSuccess)
          render json: { message: "Model #{model_name} pulled successfully" }
        else
          render json: { error: "Failed to pull model" }, status: :unprocessable_entity
        end
      rescue => e
        render json: { error: e.message }, status: :unprocessable_entity
      end
    end
  end
end
