class CreateEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :events do |t|
      t.references :account, null: false, foreign_key: true
      t.references :bucket, null: false, foreign_key: true
      t.string :event_type, null: false
      t.string :object_key
      t.jsonb :payload, null: false, default: {}
      t.datetime :processed_at

      t.timestamps
    end

    add_index :events, :processed_at
    add_index :events, %i[bucket_id created_at]
    add_index :events, :event_type
  end
end
