class Bucket < ApplicationRecord
  belongs_to :account

  has_one :access_policy, dependent: :destroy
  has_many :events, dependent: :destroy
  has_many :multipart_uploads, dependent: :destroy
  has_many :storage_objects, dependent: :destroy
end
