ENV["RAILS_ENV"] = "test"
require File.expand_path("../config/environment", __dir__)

# Load coverage tracking before test help
require_relative 'coverage_helper'

require "rails/test_help"

class ActiveSupport::TestCase
  # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
  fixtures :all

  # Add more helper methods to be used by all tests here...
  
  def create_test_user(email: "test@example.com", plan: "free")
    user = User.create!(email: email, password: "password")
    account = Account.create!(plan: plan)
    user.account = account
    user.save!
    user
  end
  
  def create_test_api_key(account:, name: "test-key")
    api_key, plaintext = ApiKey.generate_for!(account: account, name: name)
    [api_key, plaintext]
  end
  
  def create_test_bucket(account:, name: "test-bucket", region: "us-west-2")
    Bucket.create!(account: account, name: name, region: region)
  end
  
  def create_test_object(bucket:, key: "test-file.txt", size: 1024, etag: "test123")
    StorageObject.create!(bucket: bucket, key: key, size: size, etag: etag)
  end
  
  def assert_json_response(expected_keys = [])
    assert_response :success
    json_response = JSON.parse(response.body)
    expected_keys.each do |key|
      assert json_response.key?(key.to_s), "Response missing key: #{key}"
    end
    json_response
  end
  
  def assert_error_response(expected_status = :unprocessable_entity)
    assert_response expected_status
    json_response = JSON.parse(response.body)
    assert json_response.key?("error"), "Response should contain error key"
    json_response
  end
end
