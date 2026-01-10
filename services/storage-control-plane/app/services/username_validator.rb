class UsernameValidator
  include ActiveModel::Model
  include ActiveModel::Attributes

  class << self
    def available?(username)
      return false if username.blank?
      return false if username.length < 3
      return false if username.length > 50
      
      # Check against reserved usernames
      return false if reserved_username?(username)
      
      # Check against existing usernames
      !username_exists?(username)
    end

    def check_availability(username)
      return { available: false, reason: 'Username is required' } if username.blank?
      return { available: false, reason: 'Username must be at least 3 characters' } if username.length < 3
      return { available: false, reason: 'Username must be less than 50 characters' } if username.length > 50
      return { available: false, reason: 'Username is reserved' } if reserved_username?(username)
      return { available: false, reason: 'Username is already taken' } if username_exists?(username)
      
      { available: true, reason: 'Username is available' }
    end

    private

    def reserved_username?(username)
      reserved_usernames.include?(username.downcase)
    end

    def username_exists?(username)
      # Check cache first
      cache_key = "username_exists:#{username.downcase}"
      
      # Try Redis cache first
      if Rails.cache.exist?(cache_key)
        return Rails.cache.read(cache_key)
      end
      
      # Check database
      exists = User.exists?(username: username.downcase)
      
      # Cache result for 5 minutes
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
  end
end
