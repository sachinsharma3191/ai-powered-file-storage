require "test_helper"

class V1::AccountControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = User.create!(email: "test@example.com", password: "password")
    @account = Account.create!(plan: "free")
    @user.account = @account
    @user.save!
    
    @api_key = ApiKey.generate_for!(account: @account, name: "test-key")
    @token = @api_key.plaintext_key
  end

  test "should show account information" do
    get "/api/v1/account", headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal @account.id, json_response["id"]
    assert_equal @account.plan, json_response["plan"]
    assert_equal @api_key.id, json_response["api_key"]["id"]
    assert_equal @api_key.name, json_response["api_key"]["name"]
    assert_equal @api_key.status, json_response["api_key"]["status"]
  end

  test "should show account information with session authentication" do
    @user.update!(session_token: "session_token_123")
    
    get "/api/v1/account", headers: { "Authorization" => "Bearer session_token_123" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal @account.id, json_response["id"]
    assert_equal @account.plan, json_response["plan"]
    assert_nil json_response["api_key"] # No API key for session auth
  end

  test "should handle nil api_key gracefully" do
    @user.update!(session_token: "session_token_123")
    
    get "/api/v1/account", headers: { "Authorization" => "Bearer session_token_123" }
    
    assert_response :success
    # Should not raise NoMethodError on Current.api_key.id
  end

  test "should list API keys" do
    get "/api/v1/account/api_keys", headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_kind_of Array, json_response
    assert_equal 1, json_response.length
    assert_equal @api_key.id, json_response.first["id"]
    assert_equal @api_key.name, json_response.first["name"]
  end

  test "should create API key" do
    post "/api/v1/account/api_keys", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { name: "new-key", scopes: {} }
    
    assert_response :created
    json_response = JSON.parse(response.body)
    
    assert_equal "new-key", json_response["api_key"]["name"]
    assert_equal "active", json_response["api_key"]["status"]
    assert_not_nil json_response["plaintext_key"]
  end

  test "should revoke API key" do
    new_key = ApiKey.generate_for!(account: @account, name: "revoke-me")
    
    delete "/api/v1/account/api_keys/#{new_key.id}", 
           headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal "API key revoked", json_response["message"]
    
    new_key.reload
    assert_equal "revoked", new_key.status
  end

  test "should not revoke current API key" do
    delete "/api/v1/account/api_keys/#{@api_key.id}", 
           headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_equal "Cannot revoke your current API key", json_response["error"]
  end

  test "should activate API key" do
    inactive_key = ApiKey.generate_for!(account: @account, name: "inactive-key")
    inactive_key.update!(status: "inactive")
    
    put "/api/v1/account/api_keys/#{inactive_key.id}/activate", 
        headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal "active", json_response["api_key"]["status"]
    assert_equal inactive_key.id, json_response["api_key"]["id"]
    
    # Check that other keys are deactivated
    @api_key.reload
    assert_equal "inactive", @api_key.status
    
    inactive_key.reload
    assert_equal "active", inactive_key.status
  end

  test "should update plan" do
    put "/api/v1/account/plan", 
        headers: { "Authorization" => "Bearer #{@token}" },
        params: { plan: "pro" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal "Plan updated successfully", json_response["message"]
    
    @account.reload
    assert_equal "pro", @account.plan
  end

  test "should return unauthorized without valid token" do
    get "/api/v1/account", headers: { "Authorization" => "Bearer invalid_token" }
    
    assert_response :unauthorized
  end

  test "should return unauthorized without token" do
    get "/api/v1/account"
    
    assert_response :unauthorized
  end
end
