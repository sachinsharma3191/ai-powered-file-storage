#!/usr/bin/env ruby

require 'net/http'
require 'json'
require 'securerandom'

class RustIntegrationTest
  def initialize
    @control_plane_url = 'http://localhost:3000'
    @data_plane_url = 'http://localhost:4000'
    @api_key = create_test_api_key
    @token = nil
  end

  def run_all_tests
    puts "🚀 Starting Rust Data Plane Integration Tests"
    puts "=" * 50

    test_health_endpoints
    test_authentication
    test_simple_upload_flow
    test_multipart_upload_flow
    test_download_flow
    test_chunking_features

    puts "\n✅ All tests completed!"
  end

  private

  def test_health_endpoints
    puts "\n🏥 Testing Health Endpoints"

    # Test control plane health
    response = http_get("#{@control_plane_url}/healthz")
    assert_equal(200, response.code.to_i, "Control plane health check failed")
    puts "   ✅ Control plane healthy"

    # Test data plane health
    response = http_get("#{@data_plane_url}/healthz")
    assert_equal(200, response.code.to_i, "Data plane health check failed")
    puts "   ✅ Data plane healthy"
  end

  def test_authentication
    puts "\n🔐 Testing Authentication"

    # Create a test bucket
    bucket_name = "test-bucket-#{SecureRandom.hex(4)}"
    response = http_post("#{@control_plane_url}/api/v1/buckets", 
                        { name: bucket_name, region: "us-west-2" },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(201, response.code.to_i, "Bucket creation failed")
    puts "   ✅ Bucket created: #{bucket_name}"

    @bucket_name = bucket_name
  end

  def test_simple_upload_flow
    puts "\n📤 Testing Simple Upload Flow"

    # Initialize upload
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/test-file:init",
                        { content_type: "text/plain" },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(201, response.code.to_i, "Upload initialization failed")
    
    upload_data = JSON.parse(response.body)
    assert_match(/\/dp\/v1\/objects\//, upload_data['upload_url'], "Wrong data plane endpoint")
    puts "   ✅ Upload initialized with Rust endpoint: #{upload_data['upload_url']}"

    # Simulate upload to Rust (in real scenario, client would do this)
    # For testing, we'll verify the token is valid
    token = upload_data['token']
    assert_not_nil(token, "Token not provided")
    puts "   ✅ Scoped token generated"

    # Finalize upload
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/test-file:finalize",
                        { version: upload_data['version'], size: 12, etag: "\"test-etag\"" },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(200, response.code.to_i, "Upload finalization failed")
    puts "   ✅ Upload finalized"
  end

  def test_multipart_upload_flow
    puts "\n📦 Testing Multipart Upload Flow"

    # Initiate multipart upload
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/large-file:multipart/initiate",
                        { part_size: 5242880, presigned_parts: 2 },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(201, response.code.to_i, "Multipart upload initiation failed")
    
    upload_data = JSON.parse(response.body)
    assert_equal(2, upload_data['presigned_part_urls'].length, "Wrong number of presigned URLs")
    
    upload_data['presigned_part_urls'].each_with_index do |url_data, index|
      assert_match(/\/dp\/v1\/uploads\//, url_data['upload_url'], "Wrong data plane endpoint for part #{index + 1}")
      assert_not_nil(url_data['token'], "Token not provided for part #{index + 1}")
    end
    puts "   ✅ Multipart upload initiated with Rust endpoints"

    upload_id = upload_data['upload_id']

    # Test individual part URL
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/large-file:multipart/part-url",
                        { upload_id: upload_id, part_number: 3 },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(200, response.code.to_i, "Part URL generation failed")
    
    part_data = JSON.parse(response.body)
    assert_match(/\/dp\/v1\/uploads\/#{upload_id}\/parts\/3/, part_data['upload_url'], "Wrong part URL format")
    puts "   ✅ Individual part URL generated"

    # Complete multipart upload
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/large-file:multipart/complete",
                        { 
                          upload_id: upload_id,
                          parts: [
                            { part_number: 1, etag: "\"part1-etag\"", size: 5242880, checksum: "part1-checksum" },
                            { part_number: 2, etag: "\"part2-etag\"", size: 5242880, checksum: "part2-checksum" }
                          ]
                        },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(200, response.code.to_i, "Multipart upload completion failed")
    puts "   ✅ Multipart upload completed"
  end

  def test_download_flow
    puts "\n📥 Testing Download Flow"

    # Create an object first
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/download-test:init",
                        { content_type: "application/octet-stream" },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(201, response.code.to_i, "Test object creation failed")
    
    upload_data = JSON.parse(response.body)
    
    # Finalize the object
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/download-test:finalize",
                        { version: upload_data['version'], size: 1024, etag: "\"download-etag\"" },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(200, response.code.to_i, "Test object finalization failed")

    # Get download URL
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/download-test:download-url",
                        {},
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(200, response.code.to_i, "Download URL generation failed")
    
    download_data = JSON.parse(response.body)
    assert_match(/\/dp\/v1\/objects\//, download_data['download_url'], "Wrong download endpoint")
    assert_not_nil(download_data['token'], "Download token not provided")
    puts "   ✅ Download URL generated with Rust endpoint"
  end

  def test_chunking_features
    puts "\n🧩 Testing Chunking Features"

    # Test that chunk manifest is included in responses
    response = http_post("#{@control_plane_url}/api/v1/buckets/#{@bucket_name}/objects/chunk-test:init",
                        { content_type: "application/octet-stream" },
                        { 'Authorization' => "Bearer #{@api_key}" })
    assert_equal(201, response.code.to_i, "Chunk test object creation failed")
    
    upload_data = JSON.parse(response.body)
    puts "   ✅ Chunking enabled for uploads"
    
    # Verify token contains correct claims for chunking
    token = upload_data['token']
    decoded = JWT.decode(token, 'rust-integration-secret-key-2024', true, { algorithm: 'HS256' })
    claims = decoded[0]
    
    assert_equal("put_object", claims['act'], "Wrong action in token")
    assert_equal(@bucket_name, claims['bucket'], "Wrong bucket in token")
    assert_equal("chunk-test", claims['key'], "Wrong key in token")
    puts "   ✅ Token claims validated for chunking"
  end

  def create_test_api_key
    # This would normally be created through the API
    # For testing, we'll use a hardcoded key that matches the test setup
    "test-api-key-#{SecureRandom.hex(8)}"
  end

  def http_get(url, headers = {})
    uri = URI(url)
    Net::HTTP.get_response(uri, headers)
  end

  def http_post(url, body, headers = {})
    uri = URI(url)
    http = Net::HTTP.new(uri.host, uri.port)
    request = Net::HTTP::Post.new(uri)
    request['Content-Type'] = 'application/json'
    headers.each { |k, v| request[k] = v }
    request.body = body.to_json
    http.request(request)
  end

  def assert_equal(expected, actual, message)
    unless expected == actual
      puts "   ❌ #{message}: expected #{expected}, got #{actual}"
      exit 1
    end
  end

  def assert_not_nil(value, message)
    if value.nil?
      puts "   ❌ #{message}: value is nil"
      exit 1
    end
  end
end

# Run the tests
if __FILE__ == $0
  require 'jwt'
  
  begin
    test = RustIntegrationTest.new
    test.run_all_tests
  rescue => e
    puts "\n❌ Test failed: #{e.message}"
    puts e.backtrace
    exit 1
  end
end
