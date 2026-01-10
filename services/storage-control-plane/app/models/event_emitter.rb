# frozen_string_literal: true

require 'json'
require 'redis'
require 'securerandom'

# Event emitter for publishing storage events to Python agent
class EventEmitter
  class << self
    attr_accessor :redis_client, :config
    
    def configure(config = {})
      @config = config
      @redis_client = Redis.new(
        host: config[:host] || 'localhost',
        port: config[:port] || 6379,
        db: config[:db] || 0,
        password: config[:password]
      )
    end
    
    def configured?
      !@redis_client.nil?
    end
    
    # Emit object created event
    def emit_object_created(bucket:, object:, version:, account_id:, region: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'ObjectCreated',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'low',
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        object_key: object.key,
        object_size: version.size,
        object_etag: version.etag,
        content_type: version.content_type,
        version_id: version.id,
        storage_class: version.storage_class,
        metadata: {
          ruby_version: Rails.version,
          controller: 'objects_controller'
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Emit object deleted event
    def emit_object_deleted(bucket:, object:, account_id:, region: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'ObjectDeleted',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'medium',
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        object_key: object.key,
        metadata: {
          deleted_at: Time.now.iso8601,
          ruby_version: Rails.version
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Emit multipart upload completed
    def emit_multipart_completed(bucket:, upload:, account_id:, region: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'MultipartCompleted',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'low',
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        upload_id: upload.upload_id,
        object_key: upload.key,
        total_size: upload.multipart_parts.sum(&:size),
        part_count: upload.multipart_parts.count,
        metadata: {
          completed_at: Time.now.iso8601,
          ruby_version: Rails.version
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Emit bucket policy changed
    def emit_bucket_policy_changed(bucket:, account_id:, old_policy:, new_policy:, region: nil)
      # Check if bucket is now public
      is_public = detect_public_access(new_policy)
      severity = is_public ? 'high' : 'medium'
      
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'BucketPolicyChanged',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: severity,
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        bucket_policy: new_policy,
        public_read: is_public,
        public_write: detect_public_write_access(new_policy),
        metadata: {
          old_policy: old_policy,
          changed_at: Time.now.iso8601,
          ruby_version: Rails.version
        }
      }
      
      publish_event('storage-events', event)
      
      # Also emit public bucket detected event if applicable
      if is_public
        emit_public_bucket_detected(bucket: bucket, account_id: account_id, region: region, policy: new_policy)
      end
    end
    
    # Emit public bucket detected
    def emit_public_bucket_detected(bucket:, account_id:, region: nil, policy: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'PublicBucketDetected',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'high',
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        bucket_policy: policy,
        public_read: true,
        metadata: {
          detected_at: Time.now.iso8601,
          ruby_version: Rails.version,
          security_implications: 'Public read access allows anyone to list and download objects'
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Emit download spiked event (called from monitoring)
    def emit_download_spiked(bucket:, object:, account_id:, download_count:, region: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'DownloadSpiked',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'medium',
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        object_key: object.key,
        metric_name: 'download_count',
        metric_value: download_count,
        metric_unit: 'count',
        threshold: 1000, # Configurable threshold
        metadata: {
          monitoring_window: '60_minutes',
          ruby_version: Rails.version,
          operational_impact: 'High download activity may impact bandwidth costs and performance'
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Emit access denied event
    def emit_access_denied(account_id:, bucket_name: nil, object_key: nil, user_id: nil, ip_address: nil, user_agent: nil, error_message: nil, request_id: nil, region: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'AccessDenied',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'medium',
        account_id: account_id,
        region: region,
        bucket_name: bucket_name,
        object_key: object_key,
        user_id: user_id,
        ip_address: ip_address,
        user_agent: user_agent,
        request_id: request_id,
        error_message: error_message,
        metadata: {
          ruby_version: Rails.version,
          controller: 'base_controller'
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Emit virus scan failed (if implemented)
    def emit_virus_scan_failed(bucket:, object:, account_id:, scan_result:, region: nil)
      event = {
        event_id: SecureRandom.uuid,
        event_type: 'VirusScanFailed',
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: 'critical',
        account_id: account_id,
        region: region,
        bucket_name: bucket.name,
        object_key: object.key,
        metadata: {
          scan_result: scan_result,
          scanned_at: Time.now.iso8601,
          ruby_version: Rails.version,
          security_implications: 'Potential malware detected - immediate action required'
        }
      }
      
      publish_event('storage-events', event)
    end
    
    # Generic event emitter
    def emit_custom_event(event_type:, account_id:, severity: 'medium', **metadata)
      event = {
        event_id: SecureRandom.uuid,
        event_type: event_type,
        timestamp: Time.now.iso8601,
        source: 'ruby_control_plane',
        severity: severity,
        account_id: account_id,
        metadata: metadata.merge(ruby_version: Rails.version)
      }
      
      publish_event('storage-events', event)
    end
    
    private
    
    def publish_event(stream, event)
      return unless configured?
      
      wrapped_event = {
        event: event,
        retry_count: 0,
        max_retries: 3,
        dead_letter: false,
        processed_at: nil
      }
      
      begin
        @redis_client.xadd(
          stream,
          wrapped_event,
          maxlen: 10000 # Keep stream size manageable
        )
        
        Rails.logger.info "Event published: #{event[:event_type]} (#{event[:event_id]})"
        
      rescue => e
        Rails.logger.error "Failed to publish event: #{e.message}"
        # Optionally send to dead letter queue or retry later
      end
    end
    
    def detect_public_access(policy)
      return false if policy.nil? || policy.empty?
      
      # Check for public read access in bucket policy
      policy.each do |statement|
        next unless statement['Effect'] == 'Allow'
        
        statement['Principal'] ||= {}
        principals = Array(statement['Principal']['AWS'] || statement['Principal']['*'])
        
        # Check if public principal (* or specific public identifiers)
        if principals.include?('*') || 
           principals.include?('arn:aws:iam::aws:group/AllUsers') ||
           principals.include?('arn:aws:iam::aws:user/AllUsers')
          
          # Check if s3:GetObject action is allowed
          actions = Array(statement['Action'] || statement['NotAction'])
          return true if actions.include?('s3:GetObject') || 
                        actions.include?('s3:*') ||
                        actions.include?('*')
        end
      end
      
      false
    end
    
    def detect_public_write_access(policy)
      return false if policy.nil? || policy.empty?
      
      policy.each do |statement|
        next unless statement['Effect'] == 'Allow'
        
        statement['Principal'] ||= {}
        principals = Array(statement['Principal']['AWS'] || statement['Principal']['*'])
        
        if principals.include?('*') || 
           principals.include?('arn:aws:iam::aws:group/AllUsers') ||
           principals.include?('arn:aws:iam::aws:user/AllUsers')
          
          actions = Array(statement['Action'] || statement['NotAction'])
          return true if actions.include?('s3:PutObject') || 
                        actions.include?('s3:*') ||
                        actions.include?('*')
        end
      end
      
      false
    end
  end
end
