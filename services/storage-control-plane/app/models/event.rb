class Event < ApplicationRecord
  belongs_to :account
  belongs_to :bucket
end
