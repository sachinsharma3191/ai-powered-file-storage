require "test_helper"

class RustDataPlaneTest < ActionDispatch::IntegrationTest
  def setup
    @user = User.create!(email: "test@example.com", password: "password")
    @account = Account.create!(plan: "free")
    @user.account = @account
    @user.save!
    
    @api_key = ApiKey.generate_for!(account: @account, name: "test-key")
    @token = @api_key.plaintext_key
    
    @bucket = Bucket.create!(account: @account, name: "test-bucket", region: "us-west-2")
  end

  test "simple upload flow with Rust data plane" do
    # Step 1: Initialize upload
    post "/api/v1/buckets/#{@bucket.name}/objects/test-file:init", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { content_type: "text/plain", metadata: { "description" => "test file" } }
    
    assert_response :success
    upload_data = JSON.parse(response.body)
    
    assert_equal "test-bucket", upload_data["bucket"]
    assert_equal "test-file", upload_data["key"]
    assert_not_nil upload_data["version"]
    assert_not_nil upload_data["object_version_id"]
    assert_match %r{/dp/v1/objects/}, upload_data["upload_url"]
    assert_not_nil upload_data["token"]
    
    # Step 2: Simulate direct upload to Rust (in real scenario, client would do this)
    # For testing, we'll skip the actual upload and go to finalize
    
    # Step 3: Finalize upload
    post "/api/v1/buckets/#{@bucket.name}/objects/test-file:finalize",
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { 
           version: upload_data["version"],
           size: 12,
           etag: "\"test-etag\"",
           checksum: "test-checksum"
         }
    
    assert_response :success
    finalize_data = JSON.parse(response.body)
    
    assert_equal "test-bucket", finalize_data["object"]["key"]
    assert_equal "available", finalize_data["object"]["current_version"]["status"]
  end

  test "multipart upload flow with Rust data plane" do
    # Step 1: Initiate multipart upload
    post "/api/v1/buckets/#{@bucket.name}/objects/large-file:multipart/initiate",
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { part_size: 5 * 1024 * 1024, presigned_parts: 2 }
    
    assert_response :success
    upload_data = JSON.parse(response.body)
    
    assert_equal "test-bucket", upload_data["bucket"]
    assert_equal "large-file", upload_data["key"]
    assert_not_nil upload_data["upload_id"]
    assert_equal 2, upload_data["presigned_part_urls"].length
    
    # Verify presigned URLs use new Rust data plane endpoints
    upload_data["presigned_part_urls"].each_with_index do |url_data, index|
      assert_equal (index + 1), url_data["part_number"]
      assert_match %r{/dp/v1/uploads/#{upload_data["upload_id"]}/parts/#{index + 1}}, url_data["upload_url"]
      assert_not_nil url_data["token"]
    end
    
    # Step 2: Get individual part URL
    post "/api/v1/buckets/#{@bucket.name}/objects/large-file:multipart/part-url",
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { 
           upload_id: upload_data["upload_id"],
           part_number: 3
         }
    
    assert_response :success
    part_url_data = JSON.parse(response.body)
    
    assert_equal 3, part_url_data["part_number"]
    assert_match %r{/dp/v1/uploads/#{upload_data["upload_id"]}/parts/3}, part_url_data["upload_url"]
    assert_not_nil part_url_data["token"]
    
    # Step 3: Complete multipart upload (simulating successful parts)
    post "/api/v1/buckets/#{@bucket.name}/objects/large-file:multipart/complete",
         headers: { "Authorization" => "Bearer #{@token}" },
         params: {
           upload_id: upload_data["upload_id"],
           parts: [
             { part_number: 1, etag: "\"part1-etag\"", size: 5242880, checksum: "part1-checksum" },
             { part_number: 2, etag: "\"part2-etag\"", size: 5242880, checksum: "part2-checksum" }
           ]
         }
    
    assert_response :success
    complete_data = JSON.parse(response.body)
    
    assert_equal "large-file", complete_data["object"]["key"]
    assert_equal "available", complete_data["object"]["current_version"]["status"]
    assert_not_nil complete_data["object"]["current_version"]["manifest"]
  end

  test "download URL generation with Rust data plane" do
    # Create an object first
    storage_object = @bucket.storage_objects.create!(key: "download-test")
    object_version = storage_object.object_versions.create!(
      version: SecureRandom.uuid,
      size: 1024,
      content_type: "application/octet-stream",
      status: "available",
      etag: "\"download-etag\""
    )
    storage_object.update!(current_version_id: object_version.id)
    
    # Get download URL
    post "/api/v1/buckets/#{@bucket.name}/objects/download-test:download-url",
         headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    download_data = JSON.parse(response.body)
    
    assert_equal "test-bucket", download_data["bucket"]
    assert_equal "download-test", download_data["key"]
    assert_equal object_version.version, download_data["version"]
    assert_match %r{/dp/v1/objects/#{object_version.id}}, download_data["download_url"]
    assert_not_nil download_data["token"]
  end

  test "scoped token contains correct claims for Rust data plane" do
    # Test that tokens issued for Rust data plane contain correct claims
    post "/api/v1/buckets/#{@bucket.name}/objects/token-test:init",
         headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    upload_data = JSON.parse(response.body)
    token = upload_data["token"]
    
    # Decode and verify token claims
    decoded_token = JWT.decode(token, Rails.application.secret_key_base, true, { algorithm: 'HS256' })
    claims = decoded_token[0]
    
    assert_equal "storage-control-plane", claims["iss"]
    assert_equal "chunk-gateway", claims["aud"]
    assert_equal @account.id.to_s, claims["sub"]
    assert_equal "put_object", claims["act"]
    assert_equal "test-bucket", claims["bucket"]
    assert_equal "token-test", claims["key"]
    assert_not_nil claims["version"]
  end
end
