class Bucket < ApplicationRecord
  belongs_to :account

  has_one :access_policy, dependent: :destroy
  has_many :events, dependent: :destroy
  has_many :multipart_uploads, dependent: :destroy
  has_many :storage_objects, dependent: :destroy

  def access_policy
    super&.policy || {}
  end

  def access_policy=(policy)
    if access_policy_record.present?
      access_policy_record.update!(policy: policy)
    else
      create_access_policy!(policy: policy)
    end
  end

  private

  def access_policy_record
    super
  end
end
