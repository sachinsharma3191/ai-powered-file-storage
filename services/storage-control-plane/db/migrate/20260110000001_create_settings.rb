class CreateSettings < ActiveRecord::Migration[8.1]
  def change
    create_table :settings do |t|
      t.references :account, null: false, foreign_key: true
      t.string :key, null: false
      t.text :value
      t.boolean :secret, default: false

      t.timestamps
    end

    add_index :settings, [:account_id, :key], unique: true
  end
end
