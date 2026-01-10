class CreateBuckets < ActiveRecord::Migration[8.1]
  def change
    create_table :buckets do |t|
      t.references :account, null: false, foreign_key: true
      t.string :name, null: false
      t.string :region, null: false
      t.string :versioning, null: false, default: "suspended"
      t.jsonb :default_encryption, null: false, default: {}

      t.timestamps
    end

    add_index :buckets, :name, unique: true
  end
end
