class Account < ApplicationRecord
  has_many :api_keys, dependent: :destroy
  has_many :buckets, dependent: :destroy
  has_many :events, dependent: :destroy
  has_many :settings, dependent: :destroy
  has_many :users, dependent: :destroy

  validates :plan, inclusion: { in: %w[free pro enterprise] }

  def plan_limits
    case plan
    when 'free'
      { api_keys: 5, buckets: 10, folders: 20, storage_gb: 5 }
    when 'pro'
      { api_keys: 1000, buckets: 50, folders: 50000, storage_gb: 100 }
    when 'enterprise'
      { api_keys: -1, buckets: -1, folders: -1, storage_gb: -1 }
    else
      { api_keys: 5, buckets: 10, folders: 20, storage_gb: 5 }
    end
  end

  def within_api_key_limit?
    return true if plan == 'enterprise'
    api_keys.where(status: 'active').count < plan_limits[:api_keys]
  end

  def within_bucket_limit?
    return true if plan == 'enterprise'
    buckets.count < plan_limits[:buckets]
  end

  def within_folder_limit?
    return true if plan == 'enterprise'
    unique_folder_count < plan_limits[:folders]
  end

  def unique_folder_count
    # Count unique folder names across all buckets
    folder_paths = []
    buckets.each do |bucket|
      bucket.storage_objects.where(deleted_marker: false).each do |obj|
        folder = obj.key.split('/').first
        folder_paths << folder if folder && !folder.include?('.')
      end
    end
    folder_paths.uniq.length
  end

  def storage_usage_bytes
    buckets.joins(:storage_objects)
          .where(storage_objects: { deleted_marker: false })
          .sum(:storage_objects[:size])
  end

  def storage_usage_gb
    (storage_usage_bytes.to_f / (1024**3)).round(2)
  end
end
