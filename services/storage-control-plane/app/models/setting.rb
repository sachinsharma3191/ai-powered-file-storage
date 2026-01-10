class Setting < ApplicationRecord
  belongs_to :account

  validates :key, presence: true, uniqueness: { scope: :account_id }

  OLLAMA_KEYS = %w[ollama_url ollama_model ollama_api_key].freeze
  SECRET_KEYS = %w[ollama_api_key].freeze

  def self.get(account, key)
    find_by(account: account, key: key)&.value
  end

  def self.set(account, key, value, secret: nil)
    secret = SECRET_KEYS.include?(key) if secret.nil?
    setting = find_or_initialize_by(account: account, key: key)
    setting.update!(value: value, secret: secret)
    setting
  end

  def self.ollama_config(account)
    {
      url: get(account, "ollama_url") || "http://ollama:11434",
      model: get(account, "ollama_model") || "llama3.2",
      api_key: get(account, "ollama_api_key")
    }
  end

  def display_value
    secret? ? "********" : value
  end
end
