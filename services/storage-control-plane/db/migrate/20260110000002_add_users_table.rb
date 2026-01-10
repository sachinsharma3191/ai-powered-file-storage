class AddUsersTable < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.references :account, null: false, foreign_key: true
      t.string :username, null: false
      t.string :password_digest, null: false
      t.string :role, default: 'user'
      t.string :session_token

      t.timestamps
    end

    add_index :users, :username, unique: true
    add_index :users, :session_token, unique: true
  end
end
