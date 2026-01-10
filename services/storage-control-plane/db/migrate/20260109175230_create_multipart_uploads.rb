class CreateMultipartUploads < ActiveRecord::Migration[8.1]
  def change
    create_table :multipart_uploads do |t|
      t.references :bucket, null: false, foreign_key: true
      t.string :key, null: false
      t.string :upload_id, null: false
      t.string :initiated_by
      t.string :status, null: false, default: "initiated"
      t.integer :part_size, null: false, default: 5 * 1024 * 1024

      t.timestamps
    end

    add_index :multipart_uploads, %i[bucket_id upload_id], unique: true
    add_index :multipart_uploads, %i[bucket_id key status]

    add_foreign_key :multipart_parts, :multipart_uploads
  end
end
