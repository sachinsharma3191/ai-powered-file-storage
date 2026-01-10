module V1
  class AuthController < ApplicationController
    skip_before_action :verify_authenticity_token, raise: false

    # Rate limiting for username checks
    RATE_LIMIT_REQUESTS = 10
    RATE_LIMIT_WINDOW = 1.minute

    def check_username
      username = params[:username]
      
      # Apply rate limiting
      unless rate_limit_allowed?
        render json: { error: 'Too many requests. Please try again later.' }, status: 429
        return
      end

      result = check_username_availability(username)
      render json: result
    end

    def signup
      # Validate username availability
      username_validation = check_username_availability(params[:username])
      unless username_validation[:available]
        render json: { error: username_validation[:reason] }, status: :unprocessable_entity
        return
      end

      account = Account.create!(plan: params[:plan] || 'free')
      
      user = User.new(
        account: account,
        username: params[:username],
        password: params[:password]
      )

      if user.save
        session_token = SecureRandom.hex(32)
        user.update!(session_token: session_token)
        
        render json: {
          session_token: session_token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        }
      else
        render json: { error: user.errors.full_messages.join(', ') }, status: :unprocessable_entity
      end
    rescue => e
      Rails.logger.error "Signup error: #{e.message}"
      render json: { error: 'Signup failed. Please try again.' }, status: :internal_server_error
    end

    def login
      user = User.find_by(username: params[:username])
      
      if user && user.authenticate(params[:password])
        session_token = SecureRandom.hex(32)
        user.update!(session_token: session_token)
        
        render json: {
          session_token: session_token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        }
      else
        render json: { error: 'Invalid username or password' }, status: :unauthorized
      end
    rescue => e
      Rails.logger.error "Login error: #{e.message}"
      render json: { error: 'Login failed. Please try again.' }, status: :internal_server_error
    end

    def logout
      user = authenticate_user_from_token
      if user
        user.update!(session_token: nil)
        render json: { message: 'Logged out successfully' }
      else
        render json: { error: 'Not authenticated' }, status: :unauthorized
      end
    end

    def me
      user = authenticate_user_from_token
      if user
        render json: {
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          },
          account: {
            id: user.account.id,
            plan: user.account.plan
          }
        }
      else
        render json: { error: 'Not authenticated' }, status: :unauthorized
      end
    end

    private

    def rate_limit_allowed?
      client_ip = request.remote_ip
      cache_key = "username_check_rate_limit:#{client_ip}"
      
      request_count = Rails.cache.read(cache_key) || 0
      
      if request_count >= RATE_LIMIT_REQUESTS
        false
      else
        Rails.cache.write(cache_key, request_count + 1, expires_in: RATE_LIMIT_WINDOW)
        true
      end
    end

    def check_username_availability(username)
      return { available: false, reason: 'Username is required' } if username.blank?
      return { available: false, reason: 'Username must be at least 3 characters' } if username.length < 3
      return { available: false, reason: 'Username must be less than 50 characters' } if username.length > 50
      return { available: false, reason: 'Username is reserved' } if reserved_username?(username)
      return { available: false, reason: 'Username is already taken' } if username_exists?(username)
      
      { available: true, reason: 'Username is available' }
    end

    def reserved_username?(username)
      reserved_usernames.include?(username.downcase)
    end

    def username_exists?(username)
      cache_key = "username_exists:#{username.downcase}"
      
      if Rails.cache.exist?(cache_key)
        return Rails.cache.read(cache_key)
      end
      
      exists = User.exists?(username: username.downcase)
      Rails.cache.write(cache_key, exists, expires_in: 5.minutes)
      exists
    end

    def reserved_usernames
      @reserved_usernames ||= [
        'admin', 'administrator', 'root', 'system', 'api', 'www', 'mail', 'ftp',
        'test', 'demo', 'user', 'guest', 'anonymous', 'null', 'undefined',
        'support', 'help', 'info', 'contact', 'sales', 'marketing', 'billing',
        'account', 'settings', 'profile', 'dashboard', 'console', 'panel',
        'api_key', 'token', 'auth', 'login', 'signup', 'register', 'signin',
        'logout', 'signout', 'password', 'reset', 'forgot', 'change', 'update',
        'create', 'delete', 'remove', 'edit', 'modify', 'add', 'insert',
        'get', 'post', 'put', 'patch', 'head', 'options', 'trace', 'connect',
        'index', 'home', 'default', 'main', 'app', 'application', 'web',
        'site', 'website', 'portal', 'gateway', 'service', 'services',
        'storage', 'bucket', 'object', 'file', 'files', 'data', 'database',
        'server', 'client', 'user', 'users', 'account', 'accounts', 'admin',
        'owner', 'moderator', 'member', 'guest', 'visitor', 'public', 'private',
        'secure', 'ssl', 'tls', 'https', 'http', 'www', 'ftp', 'smtp', 'pop',
        'imap', 'dns', 'mx', 'ns', 'a', 'aaaa', 'cname', 'txt', 'srv', 'ptr',
        'api', 'rest', 'soap', 'graphql', 'websocket', 'sse', 'push', 'pull',
        'upload', 'download', 'stream', 'sync', 'backup', 'restore', 'archive',
        'compress', 'extract', 'encrypt', 'decrypt', 'hash', 'salt', 'key',
        'secret', 'token', 'jwt', 'oauth', 'saml', 'ldap', 'sso', 'mfa',
        '2fa', 'otp', 'totp', 'hotp', 'recovery', 'reset', 'forgot', 'change',
        'profile', 'settings', 'preferences', 'config', 'options', 'custom',
        'theme', 'style', 'css', 'js', 'html', 'xml', 'json', 'yaml', 'yml',
        'csv', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt',
        'md', 'markdown', 'rst', 'tex', 'latex', 'bib', 'refs', 'cite',
        'blog', 'post', 'article', 'news', 'feed', 'rss', 'atom', 'xml',
        'comment', 'reply', 'thread', 'topic', 'category', 'tag', 'tags',
        'search', 'filter', 'sort', 'order', 'page', 'paginate', 'limit',
        'offset', 'count', 'total', 'size', 'length', 'width', 'height',
        'x', 'y', 'z', 'lat', 'lng', 'lat', 'lon', 'geo', 'location', 'address',
        'phone', 'email', 'fax', 'mobile', 'tablet', 'desktop', 'mobile',
        'ios', 'android', 'windows', 'mac', 'linux', 'ubuntu', 'debian',
        'centos', 'rhel', 'fedora', 'arch', 'gentoo', 'slackware', 'bsd',
        'freebsd', 'openbsd', 'netbsd', 'solaris', 'aix', 'hpux', 'unix',
        'microsoft', 'apple', 'google', 'amazon', 'facebook', 'twitter',
        'linkedin', 'github', 'gitlab', 'bitbucket', 'stackoverflow',
        'reddit', 'youtube', 'vimeo', 'netflix', 'spotify', 'apple',
        'microsoft', 'google', 'amazon', 'facebook', 'twitter', 'instagram',
        'tiktok', 'snapchat', 'whatsapp', 'telegram', 'signal', 'discord',
        'slack', 'teams', 'zoom', 'skype', 'hangouts', 'meet', 'calendar',
        'drive', 'dropbox', 'box', 'onedrive', 'icloud', 'gdrive', 's3',
        'azure', 'gcp', 'aws', 'digitalocean', 'linode', 'vultr', 'heroku',
        'netlify', 'vercel', 'cloudflare', 'fastly', 'akamai', 'cdn',
        'cache', 'redis', 'memcached', 'varnish', 'nginx', 'apache', 'iis',
        'tomcat', 'jetty', 'undertow', 'node', 'express', 'koa', 'hapi',
        'sails', 'loopback', 'feathers', 'nest', 'adonis', 'laravel', 'symfony',
        'django', 'flask', 'rails', 'sinatra', 'padrino', 'hanami', 'roda',
        'phoenix', 'elixir', 'rust', 'go', 'java', 'scala', 'kotlin', 'clojure',
        'haskell', 'fsharp', 'csharp', 'vb', 'python', 'ruby', 'perl', 'php',
        'javascript', 'typescript', 'coffeescript', 'dart', 'swift', 'objc',
        'c', 'cpp', 'cplus', 'assembly', 'bash', 'sh', 'zsh', 'fish', 'powershell',
        'batch', 'cmd', 'dos', 'windows', 'macos', 'linux', 'unix', 'bsd'
      ]
    end

    def authenticate_user_from_token
      token = request.headers['Authorization']&.gsub('Bearer ', '')
      User.find_by(session_token: token) if token.present?
    end
  end
end
