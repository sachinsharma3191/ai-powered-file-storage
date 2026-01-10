require "test_helper"

class PlanLimitsTest < ActiveSupport::TestCase
  def setup
    @account = Account.create!(plan: "free")
  end

  test "should get plan limits for free plan" do
    limits = @account.plan_limits
    assert_equal 5, limits[:api_keys]
    assert_equal 10, limits[:buckets]
    assert_equal 20, limits[:folders]
    assert_equal 5, limits[:storage_gb]
  end

  test "should get plan limits for pro plan" do
    @account.update!(plan: "pro")
    limits = @account.plan_limits
    assert_equal 1000, limits[:api_keys]
    assert_equal 50, limits[:buckets]
    assert_equal 50000, limits[:folders]
    assert_equal 100, limits[:storage_gb]
  end

  test "should get plan limits for enterprise plan" do
    @account.update!(plan: "enterprise")
    limits = @account.plan_limits
    assert_equal(-1, limits[:api_keys])
    assert_equal(-1, limits[:buckets])
    assert_equal(-1, limits[:folders])
    assert_equal(-1, limits[:storage_gb])
  end
end
