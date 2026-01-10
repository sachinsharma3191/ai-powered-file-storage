class S3Controller < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :authenticate_s3_request
  before_action :find_bucket
  before_action :find_object, only: [:head_object, :get_object, :delete_object]

  # S3 List Buckets
  def list_buckets
    buckets = @account.buckets.includes(:current_version)
    
    render xml: {
      ListAllMyBucketsResult: {
        Owner: {
          ID: @account.id,
          DisplayName: @account.username || 'account'
        },
        Buckets: buckets.map do |bucket|
          {
            Bucket: {
              Name: bucket.name,
              CreationDate: bucket.created_at.iso8601
            }
          }
        end
      }
    }
  end

  # S3 List Objects
  def list_objects
    prefix = params[:prefix]
    delimiter = params[:delimiter]
    max_keys = (params[:max_keys] || 1000).to_i
    marker = params[:marker]

    objects = @bucket.storage_objects.includes(:current_version)
                 .where('key LIKE ?', "#{prefix}%")
                 .order('key ASC')
                 .limit(max_keys + 1)

    if marker.present?
      objects = objects.where('key > ?', marker)
    end

    objects_list = objects.limit(max_keys).to_a
    is_truncated = objects.count > max_keys
    next_marker = is_truncated ? objects_list.last.key : nil

    # Handle common prefixes for delimiter
    common_prefixes = []
    if delimiter.present?
      prefixes = objects_list.map { |obj| obj.key.split(delimiter).first + delimiter }.uniq
      common_prefixes = prefixes.map { |prefix| { Prefix: prefix } }
    end

    render xml: {
      ListBucketResult: {
        Name: @bucket.name,
        Prefix: prefix,
        Marker: marker,
        MaxKeys: max_keys,
        IsTruncated: is_truncated,
        NextMarker: next_marker,
        Contents: objects_list.map do |obj|
          version = obj.current_version
          {
            Key: obj.key,
            LastModified: version&.updated_at&.iso8601,
            ETag: version&.etag,
            Size: version&.size || 0,
            StorageClass: 'STANDARD',
            Owner: {
              ID: @account.id,
              DisplayName: @account.username || 'account'
            }
          }
        end,
        CommonPrefixes: common_prefixes
      }
    }
  end

  # S3 Head Object
  def head_object
    version = @storage_object.current_version
    return head_object_not_found unless version

    response.headers['ETag'] = version.etag
    response.headers['Content-Length'] = version.size.to_s
    response.headers['Content-Type'] = version.content_type || 'application/octet-stream'
    response.headers['Last-Modified'] = version.updated_at.httpdate
    
    # Add custom metadata
    version.metadata.each do |key, value|
      response.headers["x-amz-meta-#{key}"] = value.to_s
    end

    head :ok
  end

  # S3 Get Object
  def get_object
    version = @storage_object.current_version
    return head_object_not_found unless version

    # Generate download URL from chunk gateway
    gateway_response = ChunkGatewayLocator.new.get_download_url(
      bucket: @bucket.name,
      key: @storage_object.key,
      version: version.version,
      account_id: @account.id
    )

    if gateway_response[:error]
      render json: { error: gateway_response[:error] }, status: :internal_server_error
      return
    end

    # Redirect to chunk gateway for actual download
    redirect_to gateway_response[:url], allow_other_host: true
  end

  # S3 Put Object (Simple Upload)
  def put_object
    content_type = request.headers['Content-Type'] || 'application/octet-stream'
    content_length = request.headers['Content-Length']
    metadata = extract_metadata(request.headers)

    # Create or update object
    @storage_object = @bucket.storage_objects.find_or_initialize_by(key: params[:key])
    
    # Create new version
    version = @storage_object.object_versions.build(
      content_type: content_type,
      size: content_length.to_i,
      status: 'pending',
      metadata: metadata,
      version: SecureRandom.hex(16)
    )

    if version.save
      # Generate upload URL from chunk gateway
      gateway_response = ChunkGatewayLocator.new.get_upload_url(
        bucket: @bucket.name,
        key: @storage_object.key,
        version: version.version,
        content_type: content_type,
        content_length: content_length,
        account_id: @account.id
      )

      if gateway_response[:error]
        render json: { error: gateway_response[:error] }, status: :internal_server_error
        return
      end

      # Store gateway info for completion
      version.update(
        manifest: {
          gateway_url: gateway_response[:url],
          token: gateway_response[:token]
        }
      )

      # Return upload URL for client to upload directly
      render json: {
        upload_url: gateway_response[:url],
        token: gateway_response[:token],
        version_id: version.version
      }
    else
      render json: { errors: version.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # S3 Delete Object
  def delete_object
    version = @storage_object.current_version
    return head_object_not_found unless version

    # Mark as deleted
    @storage_object.update!(deleted_marker: true, current_version: nil)
    
    render xml: {
      DeleteResult: {
        Deleted: {
          Key: @storage_object.key
        }
      }
    }
  end

  # S3 Initiate Multipart Upload
  def initiate_multipart_upload
    content_type = request.headers['Content-Type'] || 'application/octet-stream'
    metadata = extract_metadata(request.headers)

    multipart_upload = @bucket.multipart_uploads.create!(
      key: params[:key],
      initiated_by: @account.username || 'unknown',
      status: 'initiated'
    )

    render xml: {
      InitiateMultipartUploadResult: {
        Bucket: @bucket.name,
      Key: params[:key],
      UploadId: multipart_upload.upload_id
      }
    }
  end

  # S3 Upload Part
  def upload_part
    upload_id = params[:upload_id]
    part_number = params[:part_number].to_i

    multipart_upload = @bucket.multipart_uploads.find_by!(upload_id: upload_id)
    
    # Generate part upload URL from chunk gateway
    gateway_response = ChunkGatewayLocator.new.get_part_upload_url(
      bucket: @bucket.name,
      key: multipart_upload.key,
      upload_id: upload_id,
      part_number: part_number,
      content_length: request.headers['Content-Length'],
      account_id: @account.id
    )

    if gateway_response[:error]
      render json: { error: gateway_response[:error] }, status: :internal_server_error
      return
    end

    render json: {
      upload_url: gateway_response[:url],
      token: gateway_response[:token]
    }
  end

  # S3 Complete Multipart Upload
  def complete_multipart_upload
    upload_id = params[:upload_id]
    parts = params[:parts] || []

    multipart_upload = @bucket.multipart_uploads.find_by!(upload_id: upload_id)
    
    # Complete upload via chunk gateway
    gateway_response = ChunkGatewayLocator.new.complete_multipart_upload(
      bucket: @bucket.name,
      key: multipart_upload.key,
      upload_id: upload_id,
      parts: parts,
      account_id: @account.id
    )

    if gateway_response[:error]
      render json: { error: gateway_response[:error] }, status: :internal_server_error
      return
    end

    # Create final object version
    @storage_object = @bucket.storage_objects.find_or_initialize_by(key: multipart_upload.key)
    version = @storage_object.object_versions.create!(
      content_type: 'application/octet-stream',
      size: gateway_response[:size],
      etag: gateway_response[:etag],
      status: 'completed',
      version: SecureRandom.hex(16),
      manifest: gateway_response[:manifest]
    )

    # Update current version
    @storage_object.update!(current_version: version)
    multipart_upload.update!(status: 'completed')

    render xml: {
      CompleteMultipartUploadResult: {
        Location: "#{request.protocol}#{request.host_with_port}/#{multipart_upload.key}",
        Bucket: @bucket.name,
        Key: multipart_upload.key,
        ETag: version.etag
      }
    }
  end

  # S3 Abort Multipart Upload
  def abort_multipart_upload
    upload_id = params[:upload_id]
    multipart_upload = @bucket.multipart_uploads.find_by!(upload_id: upload_id)
    
    # Abort via chunk gateway
    ChunkGatewayLocator.new.abort_multipart_upload(
      bucket: @bucket.name,
      upload_id: upload_id,
      account_id: @account.id
    )

    multipart_upload.update!(status: 'aborted')

    head :no_content
  end

  private

  def authenticate_s3_request
    # Extract AWS signature from headers
    signature = request.headers['Authorization']
    return render_unauthorized unless signature

    # Parse AWS Signature V4
    if signature.start_with?('AWS4-HMAC-SHA256')
      authenticate_aws4_signature(signature)
    else
      render_unauthorized
    end
  end

  def authenticate_aws4_signature(signature)
    # Extract credentials from signature
    # This is simplified - in production, implement full AWS Signature V4
    credential_scope = signature.match(/Credential=([^,]+)/)
    return render_unauthorized unless credential_scope

    access_key = credential_scope[1].split('/')[0]
    
    # Find API key by access key (simplified)
    api_key = ApiKey.find_by(key_hash: Digest::SHA256.hexdigest(access_key))
    return render_unauthorized unless api_key&.active?

    @account = api_key.account
  end

  def find_bucket
    @bucket = @account.buckets.find_by!(name: params[:bucket_name])
  rescue ActiveRecord::RecordNotFound
    render json: { error: 'Bucket not found' }, status: :not_found
  end

  def find_object
    @storage_object = @bucket.storage_objects.find_by!(key: params[:key])
  rescue ActiveRecord::RecordNotFound
    head_object_not_found
  end

  def head_object_not_found
    head :not_found
  end

  def render_unauthorized
    render json: { error: 'Access Denied' }, status: :unauthorized
  end

  def extract_metadata(headers)
    metadata = {}
    headers.each do |key, value|
      if key.start_with?('x-amz-meta-')
        metadata_key = key.sub('x-amz-meta-', '')
        metadata[metadata_key] = value
      end
    end
    metadata
  end
end
