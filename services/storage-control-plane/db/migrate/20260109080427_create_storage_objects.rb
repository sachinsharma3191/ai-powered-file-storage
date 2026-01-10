class CreateStorageObjects < ActiveRecord::Migration[8.1]
  def change
    create_table :storage_objects do |t|
      t.references :bucket, null: false, foreign_key: true
      t.string :key, null: false
      t.bigint :current_version_id
      t.boolean :deleted_marker, null: false, default: false

      t.timestamps
    end

    add_index :storage_objects, %i[bucket_id key], unique: true
    add_index :storage_objects, :current_version_id
  end
end
