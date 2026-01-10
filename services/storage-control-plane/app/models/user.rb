class User < ApplicationRecord
  has_secure_password

  belongs_to :account

  validates :username, presence: true, uniqueness: true, length: { minimum: 3, maximum: 50 }
  validates :password, length: { minimum: 6 }, if: -> { new_record? || !password.nil? }

  before_create :generate_session_token

  def generate_session_token
    self.session_token = SecureRandom.urlsafe_base64(32)
  end

  def regenerate_session_token!
    update!(session_token: SecureRandom.urlsafe_base64(32))
  end

  def admin?
    role == 'admin'
  end
end
