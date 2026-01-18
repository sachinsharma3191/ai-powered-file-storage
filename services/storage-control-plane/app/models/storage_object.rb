class StorageObject < ApplicationRecord
  include Searchable
  include Versionable
  
  belongs_to :bucket

  belongs_to :current_version, class_name: "ObjectVersion", optional: true
  has_many :object_versions, dependent: :destroy
  has_many :versions, class_name: "ObjectVersion", dependent: :destroy
end
