class CreateAccounts < ActiveRecord::Migration[8.1]
  def change
    create_table :accounts do |t|
      t.string :plan, null: false, default: "free"

      t.timestamps
    end
  end
end
