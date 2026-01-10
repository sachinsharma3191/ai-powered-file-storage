# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin Ajax requests.

# Read more: https://github.com/cyu/rack-cors

allowed_origins = ENV.fetch("CORS_ALLOWED_ORIGINS", "").split(",").map(&:strip).reject(&:blank?)

if allowed_origins.any?
  Rails.application.config.middleware.insert_before 0, Rack::Cors do
    allow do
      origins(*allowed_origins)

      resource "*",
        headers: :any,
        methods: %i[get post put patch delete options head]
    end
  end
end
