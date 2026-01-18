Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # S3 API Compatibility Layer
  namespace :s3 do
    # S3 Bucket Operations
    get "/" => "s3#list_buckets"
    
    # S3 Object Operations
    get ":bucket_name" => "s3#list_objects"
    match ":bucket_name/:key" => "s3#head_object", via: :head
    get ":bucket_name/:key" => "s3#get_object"
    put ":bucket_name/:key" => "s3#put_object"
    delete ":bucket_name/:key" => "s3#delete_object"
    
    # S3 Multipart Upload Operations
    post ":bucket_name/:key" => "s3#initiate_multipart_upload", :uploads => ""
    put ":bucket_name/:key" => "s3#upload_part", :part_number => /\d+/, :upload_id => /.+/
    post ":bucket_name/:key" => "s3#complete_multipart_upload", :upload_id => /.+/
    delete ":bucket_name/:key" => "s3#abort_multipart_upload", :upload_id => /.+/
  end

  # WebSocket routes for real-time events
  mount ActionCable.server => '/cable'

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

    post "scoped_tokens" => "scoped_tokens#create"

    # Advanced Search
    get "search" => "search#search"
    get "search/semantic" => "search#semantic_search"
    get "search/suggestions" => "search#suggestions"
    get "search/analytics" => "search#analytics"

    resources :buckets, param: :bucket_name, only: %i[index create show destroy] do
      # Objects (metadata + listing)
      get "objects" => "objects#index"
      match "objects/:key" => "objects#head", via: :head
      delete "objects/:key" => "objects#destroy"
      
      # Simple upload (small objects)
      post "objects/:key:init" => "objects#init_upload"
      post "objects/:key:finalize" => "objects#finalize_upload"
      
      # Multipart upload (large objects)
      post "objects/:key:multipart/initiate" => "multipart_uploads#initiate"
      post "objects/:key:multipart/part-url" => "multipart_uploads#part_url"
      post "objects/:key:multipart/complete" => "multipart_uploads#complete"
      post "objects/:key:multipart/abort" => "multipart_uploads#abort"
      
      # Download
      post "objects/:key:download-url" => "objects#download_url"
      
      # Version Management
      get "objects/:key/versions" => "versions#index"
      get "objects/:key/versions/:id" => "versions#show"
      post "objects/:key/versions/:id/restore" => "versions#restore"
      get "objects/:key/versions/:id/compare" => "versions#compare"
      delete "objects/:key/versions/:id" => "versions#destroy"
      get "objects/:key/versions/history" => "versions#history"
      post "objects/:key/versions/:id/tag" => "versions#tag"
      get "objects/:key/versions/analytics" => "versions#analytics"
      
      # Bucket policy
      put "policy" => "buckets#set_policy"
      get "policy" => "buckets#get_policy"
      
      # Bucket lifecycle policies
      get "lifecycle" => "lifecycle_policies#show"
      put "lifecycle" => "lifecycle_policies#update"
      delete "lifecycle" => "lifecycle_policies#destroy"
      post "lifecycle/apply" => "lifecycle_policies#apply"
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
