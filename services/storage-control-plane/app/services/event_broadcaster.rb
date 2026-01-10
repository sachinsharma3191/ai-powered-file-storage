class EventBroadcaster
  class << self
    def broadcast_storage_event(account_id:, bucket_id:, event_type:, object_key: nil, payload: {})
      # Broadcast to account-wide channel
      ActionCable.server.broadcast(
        "storage_events_#{account_id}",
        {
          type: event_type,
          account_id: account_id,
          bucket_id: bucket_id,
          object_key: object_key,
          payload: payload,
          timestamp: Time.current.iso8601
        }
      )

      # Also broadcast to bucket-specific channel
      ActionCable.server.broadcast(
        "bucket_events_#{bucket_id}",
        {
          type: event_type,
          account_id: account_id,
          bucket_id: bucket_id,
          object_key: object_key,
          payload: payload,
          timestamp: Time.current.iso8601
        }
      )
    end

    def broadcast_object_created(account_id:, bucket_id:, object_key:, object:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'object_created',
        object_key: object_key,
        payload: {
          object: {
            key: object.key,
            size: object.current_version&.size,
            content_type: object.current_version&.content_type,
            etag: object.current_version&.etag,
            created_at: object.created_at
          }
        }
      )
    end

    def broadcast_object_updated(account_id:, bucket_id:, object_key:, object:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'object_updated',
        object_key: object_key,
        payload: {
          object: {
            key: object.key,
            size: object.current_version&.size,
            content_type: object.current_version&.content_type,
            etag: object.current_version&.etag,
            updated_at: object.updated_at
          }
        }
      )
    end

    def broadcast_object_deleted(account_id:, bucket_id:, object_key:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'object_deleted',
        object_key: object_key,
        payload: {}
      )
    end

    def broadcast_bucket_created(account_id:, bucket_id:, bucket:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'bucket_created',
        payload: {
          bucket: {
            name: bucket.name,
            region: bucket.region,
            created_at: bucket.created_at
          }
        }
      )
    end

    def broadcast_bucket_deleted(account_id:, bucket_id:, bucket_name:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'bucket_deleted',
        payload: {
          bucket_name: bucket_name
        }
      )
    end

    def broadcast_multipart_upload_started(account_id:, bucket_id:, object_key:, upload_id:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'multipart_upload_started',
        object_key: object_key,
        payload: {
          upload_id: upload_id
        }
      )
    end

    def broadcast_multipart_upload_completed(account_id:, bucket_id:, object_key:, upload_id:, object:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'multipart_upload_completed',
        object_key: object_key,
        payload: {
          upload_id: upload_id,
          object: {
            key: object.key,
            size: object.current_version&.size,
            content_type: object.current_version&.content_type,
            etag: object.current_version&.etag
          }
        }
      )
    end

    def broadcast_upload_progress(account_id:, bucket_id:, object_key:, progress:)
      broadcast_storage_event(
        account_id: account_id,
        bucket_id: bucket_id,
        event_type: 'upload_progress',
        object_key: object_key,
        payload: {
          progress: progress
        }
      )
    end
  end
end
