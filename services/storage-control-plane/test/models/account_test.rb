require "test_helper"

class AccountTest < ActiveSupport::TestCase
  def setup
    @account = Account.create!(plan: "free")
  end

  test "should validate plan inclusion" do
    account = Account.new(plan: "invalid")
    
    assert_not account.valid?
    assert_includes account.errors[:plan], "is not included in the list"
  end

  test "should have default free plan" do
    account = Account.new
    
    assert_equal "free", account.plan
  end

  test "should upgrade to pro plan" do
    @account.update!(plan: "pro")
    
    assert_equal "pro", @account.reload.plan
  end

  test "should upgrade to enterprise plan" do
    @account.update!(plan: "enterprise")
    
    assert_equal "enterprise", @account.reload.plan
  end

  test "should get plan limits" do
    free_limits = @account.plan_limits
    assert_equal 5, free_limits[:api_keys]
    assert_equal 10, free_limits[:buckets]
    assert_equal 20, free_limits[:folders]
    assert_equal 5, free_limits[:storage_gb]
    
    @account.update!(plan: "pro")
    pro_limits = @account.plan_limits
    assert_equal 1000, pro_limits[:api_keys]
    assert_equal 50, pro_limits[:buckets]
    assert_equal 50000, pro_limits[:folders]
    assert_equal 100, pro_limits[:storage_gb]
    
    @account.update!(plan: "enterprise")
    enterprise_limits = @account.plan_limits
    assert_equal(-1, enterprise_limits[:api_keys])
    assert_equal(-1, enterprise_limits[:buckets])
    assert_equal(-1, enterprise_limits[:folders])
    assert_equal(-1, enterprise_limits[:storage_gb])
  end

  test "should check if within API key limit" do
    # Free plan - 5 API keys limit
    4.times do |i|
      ApiKey.generate_for!(account: @account, name: "key-#{i}")
    end
    
    assert @account.within_api_key_limit?
    
    # Add one more (reaches limit)
    ApiKey.generate_for!(account: @account, name: "key-5")
    assert @account.within_api_key_limit?
    
    # Try to add one more (exceeds limit)
    assert_raises(StandardError) do
      ApiKey.generate_for!(account: @account, name: "key-6")
    end
  end

  test "should check if within bucket limit" do
    # Free plan - 10 buckets limit
    9.times do |i|
      Bucket.create!(account: @account, name: "bucket-#{i}", region: "us-west-2")
    end
    
    assert @account.within_bucket_limit?
    
    # Add one more (reaches limit)
    Bucket.create!(account: @account, name: "bucket-10", region: "us-west-2")
    assert @account.within_bucket_limit?
    
    # Try to add one more (exceeds limit)
    assert_raises(StandardError) do
      Bucket.create!(account: @account, name: "bucket-11", region: "us-west-2")
    end
  end

  test "should check if within folder limit" do
    # Free plan - 20 folders limit
    bucket = Bucket.create!(account: @account, name: "test-bucket", region: "us-west-2")
    
    19.times do |i|
      StorageObject.create!(
        bucket: bucket,
        key: "folder-#{i}/file.txt",
        size: 1024,
        etag: "etag#{i}"
      )
    end
    
    assert @account.within_folder_limit?
    
    # Add one more (reaches limit)
    StorageObject.create!(
      bucket: bucket,
      key: "folder-20/file.txt",
      size: 1024,
      etag: "etag20"
    )
    assert @account.within_folder_limit?
    
    # Try to add one more (exceeds limit)
    assert_raises(StandardError) do
      StorageObject.create!(
        bucket: bucket,
        key: "folder-21/file.txt",
        size: 1024,
        etag: "etag21"
      )
    end
  end

  test "should have unlimited limits for enterprise plan" do
    @account.update!(plan: "enterprise")
    
    assert @account.within_api_key_limit?
    assert @account.within_bucket_limit?
    assert @account.within_folder_limit?
    
    # Should be able to create many resources
    100.times do |i|
      ApiKey.generate_for!(account: @account, name: "key-#{i}")
      Bucket.create!(account: @account, name: "bucket-#{i}", region: "us-west-2")
    end
    
    assert @account.within_api_key_limit?
    assert @account.within_bucket_limit?
  end

  test "should count unique folders" do
    bucket = Bucket.create!(account: @account, name: "test-bucket", region: "us-west-2")
    
    # Create objects in different folders
    StorageObject.create!(bucket: bucket, key: "folder1/file1.txt", size: 1024, etag: "etag1")
    StorageObject.create!(bucket: bucket, key: "folder1/file2.txt", size: 2048, etag: "etag2")
    StorageObject.create!(bucket: bucket, key: "folder2/file1.txt", size: 1024, etag: "etag3")
    StorageObject.create!(bucket: bucket, key: "root-file.txt", size: 512, etag: "etag4")
    
    assert_equal 2, @account.unique_folder_count
  end

  test "should calculate storage usage" do
    bucket = Bucket.create!(account: @account, name: "test-bucket", region: "us-west-2")
    
    StorageObject.create!(bucket: bucket, key: "file1.txt", size: 1024, etag: "etag1")
    StorageObject.create!(bucket: bucket, key: "file2.txt", size: 2048, etag: "etag2")
    StorageObject.create!(bucket: bucket, key: "file3.txt", size: 512, etag: "etag3")
    
    # Total size: 1024 + 2048 + 512 = 3584 bytes = ~3.5KB
    assert_equal 3584, @account.storage_usage_bytes
    
    # In GB (rounded)
    assert_equal 0, @account.storage_usage_gb
  end
end
