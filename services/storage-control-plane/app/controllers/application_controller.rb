class ApplicationController < ActionController::Base
  rescue_from ActiveRecord::RecordNotFound do
    render json: { error: "not_found" }, status: :not_found
  end

  rescue_from ActiveRecord::RecordInvalid do |e|
    render json: { error: "record_invalid", detail: e.record.errors.to_hash(true) }, status: :unprocessable_entity
  end

  rescue_from ActiveRecord::RecordNotUnique do
    render json: { error: "record_not_unique" }, status: :conflict
  end

  rescue_from ActiveRecord::InvalidForeignKey do
    render json: { error: "invalid_foreign_key" }, status: :conflict
  end

  rescue_from ActionController::ParameterMissing do |e|
    render json: { error: "parameter_missing", detail: e.message }, status: :bad_request
  end
end
