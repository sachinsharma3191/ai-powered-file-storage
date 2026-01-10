class MultipartUpload < ApplicationRecord
  belongs_to :bucket

  has_many :multipart_parts, dependent: :destroy
end
