require "test_helper"

class V1::BucketsControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = User.create!(email: "test@example.com", password: "password")
    @account = Account.create!(plan: "free")
    @user.account = @account
    @user.save!
    
    @api_key = ApiKey.generate_for!(account: @account, name: "test-key")
    @token = @api_key.plaintext_key
  end

  test "should list buckets" do
    bucket = Bucket.create!(account: @account, name: "test-bucket", region: "us-west-2")
    
    get "/api/v1/buckets", headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_kind_of Array, json_response
    assert_equal 1, json_response.length
    assert_equal bucket.name, json_response.first["name"]
    assert_equal bucket.region, json_response.first["region"]
  end

  test "should create bucket" do
    post "/api/v1/buckets", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { name: "new-bucket", region: "us-east-1" }
    
    assert_response :created
    json_response = JSON.parse(response.body)
    
    assert_equal "new-bucket", json_response["name"]
    assert_equal "us-east-1", json_response["region"]
    
    bucket = Bucket.find_by(name: "new-bucket")
    assert_not_nil bucket
    assert_equal @account, bucket.account
  end

  test "should not create bucket with invalid name" do
    post "/api/v1/buckets", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { name: "", region: "us-east-1" }
    
    assert_response :unprocessable_entity
  end

  test "should delete bucket" do
    bucket = Bucket.create!(account: @account, name: "delete-me", region: "us-west-2")
    
    delete "/api/v1/buckets/#{bucket.name}", 
           headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    
    assert_not Bucket.find_by(id: bucket.id)
  end

  test "should return 404 for non-existent bucket" do
    delete "/api/v1/buckets/non-existent", 
           headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :not_found
    json_response = JSON.parse(response.body)
    assert_equal "not_found", json_response["error"]
  end

  test "should enforce bucket limits for free plan" do
    # Create 10 buckets (free plan limit)
    10.times do |i|
      Bucket.create!(account: @account, name: "bucket-#{i}", region: "us-west-2")
    end
    
    # Try to create 11th bucket
    post "/api/v1/buckets", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { name: "bucket-11", region: "us-west-2" }
    
    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_includes json_response["error"], "limit"
  end

  test "should allow more buckets for pro plan" do
    @account.update!(plan: "pro")
    
    # Create 50 buckets (pro plan limit)
    50.times do |i|
      Bucket.create!(account: @account, name: "bucket-#{i}", region: "us-west-2")
    end
    
    # Should be able to create more
    post "/api/v1/buckets", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { name: "bucket-51", region: "us-west-2" }
    
    assert_response :created
  end

  test "should set bucket policy" do
    bucket = Bucket.create!(account: @account, name: "policy-bucket", region: "us-west-2")
    policy = {
      "Version" => "2012-10-17",
      "Statement" => [
        {
          "Effect" => "Allow",
          "Principal" => "*",
          "Action" => "s3:GetObject",
          "Resource" => "arn:aws:s3:::policy-bucket/*"
        }
      ]
    }
    
    put "/api/v1/buckets/#{bucket.name}/policy", 
        headers: { "Authorization" => "Bearer #{@token}" },
        params: { policy: policy }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal policy, json_response["policy"]
  end

  test "should get bucket policy" do
    bucket = Bucket.create!(account: @account, name: "policy-bucket", region: "us-west-2")
    policy = {
      "Version" => "2012-10-17",
      "Statement" => [
        {
          "Effect" => "Allow",
          "Principal" => "*",
          "Action" => "s3:GetObject",
          "Resource" => "arn:aws:s3:::policy-bucket/*"
        }
      ]
    }
    
    # Set policy first
    bucket.access_policy = policy
    bucket.save!
    
    get "/api/v1/buckets/#{bucket.name}/policy", 
        headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal policy, json_response["policy"]
  end

  test "should return empty policy for bucket without policy" do
    bucket = Bucket.create!(account: @account, name: "no-policy-bucket", region: "us-west-2")
    
    get "/api/v1/buckets/#{bucket.name}/policy", 
        headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    assert_equal({}, json_response["policy"])
  end
end
