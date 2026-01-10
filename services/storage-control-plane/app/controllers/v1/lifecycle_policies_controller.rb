class V1::LifecyclePoliciesController < V1::BaseController
  before_action :bucket!
  
  # GET /api/v1/buckets/{bucket_name}/lifecycle
  def show
    policy = bucket.lifecycle_policy
    
    if policy
      render json: {
        id: policy.id,
        bucket_id: policy.bucket_id,
        enabled: policy.enabled,
        rules: policy.rules || []
      }
    else
      render json: {
        id: nil,
        bucket_id: bucket.id,
        enabled: false,
        rules: []
      }
    end
  end
  
  # PUT /api/v1/buckets/{bucket_name}/lifecycle
  def update
    policy_params = params.require(:policy).permit(:enabled, rules: [:id, :action, :days, :prefix, :storage_class, :enabled])
    
    policy = bucket.lifecycle_policy || bucket.build_lifecycle_policy
    
    if policy.update(policy_params)
      # Emit policy changed event
      old_enabled = policy.enabled_was
      new_enabled = policy.enabled
      
      if old_enabled != new_enabled
        EventEmitter.emit_lifecycle_policy_changed(
          bucket: bucket,
          account_id: current_account.id,
          old_policy: { enabled: old_enabled },
          new_policy: { enabled: new_enabled, rules: policy.rules },
          region: bucket.region
        )
      end
      
      render json: {
        id: policy.id,
        bucket_id: policy.bucket_id,
        enabled: policy.enabled,
        rules: policy.rules || []
      }
    else
      render json: { errors: policy.errors.full_messages }, status: :unprocessable_entity
    end
  end
  
  # DELETE /api/v1/buckets/{bucket_name}/lifecycle
  def destroy
    policy = bucket.lifecycle_policy
    
    if policy
      old_policy = { enabled: policy.enabled, rules: policy.rules }
      policy.destroy!
      
      EventEmitter.emit_lifecycle_policy_changed(
        bucket: bucket,
        account_id: current_account.id,
        old_policy: old_policy,
        new_policy: { enabled: false, rules: [] },
        region: bucket.region
      )
    end
    
    render json: { success: true }
  end
  
  # POST /api/v1/buckets/{bucket_name}/lifecycle/apply
  def apply
    policy = bucket.lifecycle_policy
    
    unless policy&.enabled?
      render json: { error: "No active lifecycle policy found" }, status: :bad_request
      return
    end
    
    # Apply lifecycle rules in background job
    LifecyclePolicyJob.perform_later(bucket.id)
    
    render json: { 
      success: true, 
      message: "Lifecycle policy application started",
      job_id: LifecyclePolicyJob.perform_later(bucket.id).job_id
    }
  end
  
  private
  
  def policy_params
    params.require(:policy).permit(
      :enabled,
      rules: [
        :id,
        :action,
        :days,
        :prefix,
        :storage_class,
        :enabled
      ]
    )
  end
end
