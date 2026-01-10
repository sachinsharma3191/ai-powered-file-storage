class CreateApiKeys < ActiveRecord::Migration[8.1]
  def change
    create_table :api_keys do |t|
      t.references :account, null: false, foreign_key: true
      t.string :name, null: false
      t.string :key_hash, null: false
      t.string :status, null: false, default: "active"
      t.jsonb :scopes, null: false, default: {}

      t.timestamps
    end

    add_index :api_keys, :key_hash, unique: true
    add_index :api_keys, %i[account_id name], unique: true
  end
end
