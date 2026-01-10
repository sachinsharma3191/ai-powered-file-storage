class StorageEventsChannel < ApplicationCable::Channel
  def subscribed
    # Stream from account-specific channel
    stream_from "storage_events_#{current_account.id}"
    
    # Also stream from bucket-specific channels if requested
    if params[:bucket_id]
      stream_from "bucket_events_#{params[:bucket_id]}"
    end
  end

  def unsubscribed
    # Any cleanup needed when channel is unsubscribed
  end

  def receive(data)
    # Handle incoming messages if needed
    case data['action']
    when 'subscribe_bucket'
      stream_from "bucket_events_#{data['bucket_id']}"
    when 'unsubscribe_bucket'
      stop_stream_from "bucket_events_#{data['bucket_id']}"
    end
  end

  private

  def current_account
    # Find account from connection identifier
    # This should be implemented based on your auth strategy
    token = connection.request.params[:token] || connection.request.headers['Authorization']&.split(' ')&.last
    return nil unless token

    # Decode JWT token or use your auth method
    decoded = ScopedTokenIssuer.new.decode(token)
    return nil unless decoded

    Account.find(decoded['account_id'])
  rescue
    nil
  end
end
