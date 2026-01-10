class CreateMultipartParts < ActiveRecord::Migration[8.1]
  def change
    create_table :multipart_parts do |t|
      t.references :multipart_upload, null: false
      t.integer :part_number, null: false
      t.bigint :size
      t.string :checksum
      t.string :etag
      t.jsonb :chunk_manifest, null: false, default: {}
      t.string :status, null: false, default: "uploaded"

      t.timestamps
    end

    add_index :multipart_parts, %i[multipart_upload_id part_number], unique: true
  end
end
