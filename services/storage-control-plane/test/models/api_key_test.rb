require "test_helper"

class ApiKeyTest < ActiveSupport::TestCase
  def setup
    @account = Account.create!(plan: "free")
  end

  test "should generate API key with plaintext" do
    record, plaintext = ApiKey.generate_for!(account: @account, name: "test-key")
    
    assert_not_nil record
    assert_not_nil plaintext
    assert_equal "test-key", record.name
    assert_equal "active", record.status
    assert_equal @account, record.account
    assert_not_nil record.hashed_key
    assert_not_nil record.salt
    assert plaintext.length >= 32
  end

  test "should validate name presence" do
    api_key = ApiKey.new(account: @account, name: "")
    
    assert_not api_key.valid?
    assert_includes api_key.errors[:name], "can't be blank"
  end

  test "should validate name uniqueness within account" do
    ApiKey.generate_for!(account: @account, name: "duplicate-name")
    
    duplicate = ApiKey.new(account: @account, name: "duplicate-name")
    
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:name], "has already been taken"
  end

  test "should allow same name in different accounts" do
    other_account = Account.create!(plan: "free")
    ApiKey.generate_for!(account: @account, name: "same-name")
    
    other_key = ApiKey.new(account: other_account, name: "same-name")
    
    assert other_key.valid?
  end

  test "should validate status inclusion" do
    api_key = ApiKey.new(account: @account, name: "test", status: "invalid")
    
    assert_not api_key.valid?
    assert_includes api_key.errors[:status], "is not included in the list"
  end

  test "should authenticate with correct key" do
    record, plaintext = ApiKey.generate_for!(account: @account, name: "test-key")
    
    authenticated = ApiKey.authenticate(plaintext)
    
    assert_equal record, authenticated
  end

  test "should not authenticate with incorrect key" do
    ApiKey.generate_for!(account: @account, name: "test-key")
    
    authenticated = ApiKey.authenticate("wrong-key")
    
    assert_nil authenticated
  end

  test "should not authenticate revoked key" do
    record, plaintext = ApiKey.generate_for!(account: @account, name: "test-key")
    record.update!(status: "revoked")
    
    authenticated = ApiKey.authenticate(plaintext)
    
    assert_nil authenticated
  end

  test "should not authenticate inactive key" do
    record, plaintext = ApiKey.generate_for!(account: @account, name: "test-key")
    record.update!(status: "inactive")
    
    authenticated = ApiKey.authenticate(plaintext)
    
    assert_nil authenticated
  end

  test "should enforce API key limits for free plan" do
    # Create 5 API keys (free plan limit)
    5.times do |i|
      ApiKey.generate_for!(account: @account, name: "key-#{i}")
    end
    
    # Try to create 6th API key
    assert_raises(StandardError) do
      ApiKey.generate_for!(account: @account, name: "key-6")
    end
  end

  test "should allow more API keys for pro plan" do
    @account.update!(plan: "pro")
    
    # Create 25 API keys (pro plan limit)
    25.times do |i|
      ApiKey.generate_for!(account: @account, name: "key-#{i}")
    end
    
    # Should be able to create more
    assert_nothing_raised do
      ApiKey.generate_for!(account: @account, name: "key-26")
    end
  end

  test "should allow unlimited API keys for enterprise plan" do
    @account.update!(plan: "enterprise")
    
    # Create 100 API keys
    100.times do |i|
      ApiKey.generate_for!(account: @account, name: "key-#{i}")
    end
    
    # Should still be able to create more
    assert_nothing_raised do
      ApiKey.generate_for!(account: @account, name: "key-101")
    end
  end

  test "should have default scopes" do
    record, _ = ApiKey.generate_for!(account: @account, name: "test-key")
    
    assert_kind_of Hash, record.scopes
    assert record.scopes.empty?
  end

  test "should accept custom scopes" do
    custom_scopes = { "read" => true, "write" => false }
    record, _ = ApiKey.generate_for!(account: @account, name: "scoped-key", scopes: custom_scopes)
    
    assert_equal custom_scopes, record.scopes
  end
end
