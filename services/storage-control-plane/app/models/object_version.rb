class ObjectVersion < ApplicationRecord
  belongs_to :storage_object

  validates :version, presence: true, uniqueness: { scope: :storage_object_id }
  validates :status, inclusion: { in: %w[pending available deleted] }
end
