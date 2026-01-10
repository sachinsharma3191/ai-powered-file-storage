Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  scope '/api' do
    namespace :v1 do
    post "bootstrap" => "bootstrap#create"

    post "auth/signup" => "auth#signup"
    post "auth/login" => "auth#login"
    post "auth/logout" => "auth#logout"
    get "auth/me" => "auth#me"
    get "auth/check_username" => "auth#check_username"

    post "admin/login" => "admin#login"
    get "admin/settings" => "admin#settings"
    get "admin/ollama/models" => "admin#available_models"
    post "admin/ollama/pull" => "admin#pull_model"
    delete "admin/ollama/models/:model" => "admin#delete_model"

    resources :api_keys, only: %i[index create]

    resources :buckets, param: :bucket_name, only: %i[index create show destroy] do
      get "objects" => "objects#index"
      get "objects/metadata" => "objects#show"
      post "objects" => "objects#create"
      post "objects/complete" => "objects#complete"

      post "multipart_uploads" => "multipart_uploads#create"
      get "multipart_uploads/:upload_id" => "multipart_uploads#show"
      post "multipart_uploads/:upload_id/abort" => "multipart_uploads#abort"
      post "multipart_uploads/:upload_id/complete" => "multipart_uploads#complete"
      get "multipart_uploads/:upload_id/parts" => "multipart_parts#index"
      put "multipart_uploads/:upload_id/parts/:part_number" => "multipart_parts#upsert"
    end

    post "scoped_tokens" => "scoped_tokens#create"

    get "account" => "account#show"
    put "account/plan" => "account#update_plan"
    get "account/api_keys" => "account#api_keys"
    post "account/api_keys" => "account#create_api_key"
    delete "account/api_keys/:key_id" => "account#revoke_api_key"
    put "account/api_keys/:key_id/activate" => "account#activate_api_key"

    resources :settings, only: %i[index show update destroy], param: :id
    get "settings/ollama/config" => "settings#ollama"
    put "settings/ollama/config" => "settings#update_ollama"
    get "settings/ollama/models" => "settings#available_models"
    post "settings/ollama/pull" => "settings#pull_model"
  end
  end

  # Defines the root path route ("/")
  # root "posts#index"
end
