class CreateLifecyclePolicies < ActiveRecord::Migration[8.1]
  def change
    create_table :lifecycle_policies do |t|
      t.references :bucket, null: false, foreign_key: true
      t.boolean :enabled, default: false, null: false
      t.json :rules, default: [], null: false
      t.timestamps
    end
    
    add_index :lifecycle_policies, :bucket_id, unique: true
    add_index :lifecycle_policies, :enabled
  end
end
