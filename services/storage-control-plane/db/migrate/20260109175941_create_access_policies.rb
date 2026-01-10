class CreateAccessPolicies < ActiveRecord::Migration[8.1]
  def change
    create_table :access_policies do |t|
      t.references :bucket, null: false, foreign_key: true, index: { unique: true }
      t.jsonb :policy, null: false, default: {}

      t.timestamps
    end
  end
end
