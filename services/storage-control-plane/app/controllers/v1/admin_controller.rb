module V1
  class AdminController < ApplicationController
    skip_before_action :verify_authenticity_token, raise: false

    ADMIN_PASSWORD = ENV.fetch('ADMIN_PASSWORD', 'admin-secret-2024')

    def login
      if params[:password] == ADMIN_PASSWORD
        render json: { message: 'Admin authenticated successfully' }
      else
        render json: { error: 'Invalid admin password' }, status: :unauthorized
      end
    end

    def settings
      render json: {
        ollama_url: ENV.fetch('OLLAMA_URL', 'http://localhost:11434'),
        admin_password_set: ENV['ADMIN_PASSWORD'].present?
      }
    end

    def ollama_config
      render json: {
        url: ENV.fetch('OLLAMA_URL', 'http://ollama:11434')
      }
    end

    def available_models
      ollama_url = ENV.fetch('OLLAMA_URL', 'http://ollama:11434')
      
      begin
        response = Net::HTTP.get_response(URI("#{ollama_url}/api/tags"))
        if response.is_a?(Net::HTTPSuccess)
          data = JSON.parse(response.body)
          models = data["models"]&.map { |m| { name: m["name"], size: m["size"], modified: m["modified_at"] } } || []
          render json: { models: models, connected: true }
        else
          render json: { models: [], connected: false, error: "Failed to connect to Ollama" }
        end
      rescue => e
        render json: { models: [], connected: false, error: e.message }
      end
    end

    def pull_model
      ollama_url = ENV.fetch('OLLAMA_URL', 'http://ollama:11434')
      model_name = params[:model]

      begin
        uri = URI("#{ollama_url}/api/pull")
        http = Net::HTTP.new(uri.host, uri.port)
        http.read_timeout = 600

        request = Net::HTTP::Post.new(uri)
        request["Content-Type"] = "application/json"
        request.body = { name: model_name, stream: false }.to_json

        response = http.request(request)

        if response.is_a?(Net::HTTPSuccess)
          render json: { message: "Model #{model_name} pulled successfully" }
        else
          render json: { error: "Failed to pull model: #{response.body}" }, status: :unprocessable_entity
        end
      rescue => e
        render json: { error: e.message }, status: :unprocessable_entity
      end
    end

    def delete_model
      ollama_url = ENV.fetch('OLLAMA_URL', 'http://ollama:11434')
      model_name = params[:model]

      begin
        uri = URI("#{ollama_url}/api/delete")
        http = Net::HTTP.new(uri.host, uri.port)

        request = Net::HTTP::Delete.new(uri)
        request["Content-Type"] = "application/json"
        request.body = { name: model_name }.to_json

        response = http.request(request)

        if response.is_a?(Net::HTTPSuccess)
          render json: { message: "Model #{model_name} deleted successfully" }
        else
          render json: { error: "Failed to delete model" }, status: :unprocessable_entity
        end
      rescue => e
        render json: { error: e.message }, status: :unprocessable_entity
      end
    end

    private

    def verify_admin_token
      admin_password = ENV.fetch('ADMIN_PASSWORD', 'admin-secret-password')
      provided_token = request.headers['X-Admin-Token']

      unless provided_token == admin_password
        render json: { error: 'Unauthorized - Invalid admin token' }, status: :unauthorized
      end
    end
  end
end
