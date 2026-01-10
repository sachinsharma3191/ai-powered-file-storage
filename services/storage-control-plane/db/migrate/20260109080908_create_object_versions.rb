class CreateObjectVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :object_versions do |t|
      t.references :storage_object, null: false, foreign_key: true
      t.string :version, null: false
      t.bigint :size
      t.string :etag
      t.string :content_type
      t.jsonb :metadata, null: false, default: {}
      t.string :status, null: false, default: "pending"
      t.jsonb :manifest, null: false, default: {}

      t.timestamps
    end

    add_index :object_versions, %i[storage_object_id version], unique: true
    add_index :object_versions, :etag

    add_foreign_key :storage_objects, :object_versions, column: :current_version_id, on_delete: :nullify
  end
end
