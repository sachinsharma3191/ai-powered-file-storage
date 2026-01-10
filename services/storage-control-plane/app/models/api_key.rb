require "openssl"
require "securerandom"

class ApiKey < ApplicationRecord
  belongs_to :account

  def self.hash_for(plaintext)
    OpenSSL::HMAC.hexdigest("SHA256", hashing_secret, plaintext)
  end

  def self.generate_for!(account:, name:, scopes: {})
    plaintext = SecureRandom.hex(32)
    record = account.api_keys.create!(
      name: name,
      key_hash: hash_for(plaintext),
      status: "active",
      scopes: scopes
    )

    [record, plaintext]
  end

  def self.hashing_secret
    ENV["API_KEY_PEPPER"].presence || Rails.application.secret_key_base
  end
end
