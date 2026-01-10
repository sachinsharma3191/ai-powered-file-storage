# frozen_string_literal: true

class LifecyclePolicy < ApplicationRecord
  belongs_to :bucket
  
  validates :bucket, presence: true
  validates :rules, presence: true
  
  serialize :rules, JSON
  
  # Apply lifecycle rules to objects
  def self.apply_to_bucket(bucket)
    policy = bucket.lifecycle_policy
    return unless policy&.enabled?
    
    policy.rules.each do |rule|
      apply_rule(bucket, rule)
    end
  end
  
  private
  
  def self.apply_rule(bucket, rule)
    case rule['action']
    when 'expire'
      apply_expire_rule(bucket, rule)
    when 'transition'
      apply_transition_rule(bucket, rule)
    when 'delete'
      apply_delete_rule(bucket, rule)
    end
  end
  
  def self.apply_expire_rule(bucket, rule)
    days = rule['days']
    prefix = rule['prefix']
    
    scope = bucket.storage_objects.where(deleted_marker: false)
    scope = scope.where("key LIKE ?", "#{prefix}%") if prefix.present?
    
    # Find objects older than specified days
    cutoff_date = days.days.ago
    expired_objects = scope.where("created_at < ?", cutoff_date)
    
    expired_objects.find_each do |object|
      # Soft delete the object
      object.update!(deleted_marker: true, current_version_id: nil)
      
      # Emit lifecycle event
      EventEmitter.emit_object_expired(
        bucket: bucket,
        object: object,
        version: object.current_version,
        account_id: bucket.account.id,
        rule: rule
      )
    end
  end
  
  def self.apply_transition_rule(bucket, rule)
    # For now, just emit an event - actual tiering would be implemented later
    days = rule['days']
    storage_class = rule['storage_class']
    prefix = rule['prefix']
    
    scope = bucket.storage_objects.where(deleted_marker: false)
    scope = scope.where("key LIKE ?", "#{prefix}%") if prefix.present?
    
    cutoff_date = days.days.ago
    objects_to_transition = scope.where("created_at < ?", cutoff_date)
    
    objects_to_transition.find_each do |object|
      # Update storage class
      if object.current_version
        object.current_version.update!(storage_class: storage_class)
      end
      
      # Emit transition event
      EventEmitter.emit_object_transitioned(
        bucket: bucket,
        object: object,
        version: object.current_version,
        account_id: bucket.account.id,
        from_class: 'standard',
        to_class: storage_class,
        rule: rule
      )
    end
  end
  
  def self.apply_delete_rule(bucket, rule)
    # Similar to expire but for delete markers
    days = rule['days']
    prefix = rule['prefix']
    
    scope = bucket.storage_objects.where(deleted_marker: true)
    scope = scope.where("key LIKE ?", "#{prefix}%") if prefix.present?
    
    cutoff_date = days.days.ago
    objects_to_delete = scope.where("updated_at < ?", cutoff_date)
    
    objects_to_delete.find_each do |object|
      # Permanently delete the object and all versions
      object.object_versions.destroy_all
      object.destroy!
      
      # Emit permanent delete event
      EventEmitter.emit_object_permanently_deleted(
        bucket: bucket,
        object_key: object.key,
        account_id: bucket.account.id,
        rule: rule
      )
    end
  end
end
