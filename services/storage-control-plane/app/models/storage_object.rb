class StorageObject < ApplicationRecord
  belongs_to :bucket

  belongs_to :current_version, class_name: "ObjectVersion", optional: true
  has_many :object_versions, dependent: :destroy
end
