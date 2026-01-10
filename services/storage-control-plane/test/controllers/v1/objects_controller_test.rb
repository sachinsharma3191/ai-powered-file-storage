require "test_helper"

class V1::ObjectsControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = User.create!(email: "test@example.com", password: "password")
    @account = Account.create!(plan: "free")
    @user.account = @account
    @user.save!
    
    @api_key = ApiKey.generate_for!(account: @account, name: "test-key")
    @token = @api_key.plaintext_key
    
    @bucket = Bucket.create!(account: @account, name: "test-bucket", region: "us-west-2")
  end

  test "should list objects" do
    object = StorageObject.create!(
      bucket: @bucket,
      key: "test-file.txt",
      size: 1024,
      etag: "abc123"
    )
    
    get "/api/v1/buckets/#{@bucket.name}/objects", 
        headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal @bucket.name, json_response["bucket"]
    assert_kind_of Array, json_response["objects"]
    assert_equal 1, json_response["objects"].length
    assert_equal object.key, json_response["objects"].first["key"]
    assert_equal object.size, json_response["objects"].first["size"]
  end

  test "should list objects with pagination" do
    # Create multiple objects
    5.times do |i|
      StorageObject.create!(
        bucket: @bucket,
        key: "file-#{i}.txt",
        size: 1024,
        etag: "etag#{i}"
      )
    end
    
    get "/api/v1/buckets/#{@bucket.name}/objects", 
        headers: { "Authorization" => "Bearer #{@token}" },
        params: { limit: 3 }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal 3, json_response["objects"].length
  end

  test "should list objects with prefix filter" do
    StorageObject.create!(bucket: @bucket, key: "docs/file1.txt", size: 1024, etag: "abc1")
    StorageObject.create!(bucket: @bucket, key: "docs/file2.txt", size: 2048, etag: "abc2")
    StorageObject.create!(bucket: @bucket, key: "images/pic.jpg", size: 5120, etag: "abc3")
    
    get "/api/v1/buckets/#{@bucket.name}/objects", 
        headers: { "Authorization" => "Bearer #{@token}" },
        params: { prefix: "docs/" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal 2, json_response["objects"].length
    json_response["objects"].each do |obj|
      assert obj["key"].start_with?("docs/")
    end
  end

  test "should create object" do
    post "/api/v1/buckets/#{@bucket.name}/objects", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { key: "new-file.txt" }
    
    assert_response :created
    json_response = JSON.parse(response.body)
    
    assert_equal "new-file.txt", json_response["key"]
    assert_not_nil json_response["upload_id"]
    assert_not_nil json_response["upload_url"]
    
    object = StorageObject.find_by(key: "new-file.txt")
    assert_not_nil object
    assert_equal @bucket, object.bucket
  end

  test "should delete object" do
    object = StorageObject.create!(
      bucket: @bucket,
      key: "delete-me.txt",
      size: 1024,
      etag: "delete123"
    )
    
    delete "/api/v1/buckets/#{@bucket.name}/objects/#{object.key}", 
           headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    
    object.reload
    assert object.deleted_marker
  end

  test "should return 404 for non-existent bucket" do
    get "/api/v1/buckets/non-existent/objects", 
        headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :not_found
    json_response = JSON.parse(response.body)
    assert_equal "not_found", json_response["error"]
  end

  test "should return empty objects list for empty bucket" do
    get "/api/v1/buckets/#{@bucket.name}/objects", 
        headers: { "Authorization" => "Bearer #{@token}" }
    
    assert_response :success
    json_response = JSON.parse(response.body)
    
    assert_equal @bucket.name, json_response["bucket"]
    assert_equal [], json_response["objects"]
  end

  test "should enforce object limits for free plan" do
    # Create 20 objects (free plan folder limit)
    20.times do |i|
      StorageObject.create!(
        bucket: @bucket,
        key: "folder-#{i}/file.txt",
        size: 1024,
        etag: "etag#{i}"
      )
    end
    
    # Try to create 21st object in new folder (exceeds folder limit)
    post "/api/v1/buckets/#{@bucket.name}/objects", 
         headers: { "Authorization" => "Bearer #{@token}" },
         params: { key: "folder-20/file.txt" }
    
    assert_response :unprocessable_entity
    json_response = JSON.parse(response.body)
    assert_includes json_response["error"], "folder limit"
  end
end
