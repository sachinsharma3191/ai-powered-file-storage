# SimpleCov configuration for 100% code coverage
require 'simplecov'

# Configure SimpleCov
SimpleCov.start 'rails' do
  # Minimum coverage requirement - build fails if below this
  minimum_coverage 100
  
  # Track all files in app directory
  track_files '{app,lib}/**/*.rb'
  
  # Exclude test files, migrations, and configuration
  add_filter '/test/'
  add_filter '/db/migrate/'
  add_filter '/config/'
  add_filter '/vendor/'
  
  # Group coverage by type
  add_group 'Controllers', 'app/controllers'
  add_group 'Models', 'app/models'
  add_group 'Services', 'app/services'
  add_group 'Jobs', 'app/jobs'
  add_group 'Mailers', 'app/mailers'
  
  # Use simple formatter for CI/CD
  SimpleCov.formatter = SimpleCov::Formatter::MultiFormatter.new([
    SimpleCov::Formatter::HTMLFormatter,
    SimpleCov::JSONFormatter
  ])
end

# Fail build if coverage is below minimum
SimpleCov.at_exit do
  SimpleCov.result.format!
  
  coverage = SimpleCov.result.covered_percent
  minimum = ENV.fetch('COVERAGE_MINIMUM', '100.0').to_f
  
  if coverage < minimum
    puts "\n❌ COVERAGE FAILED: #{coverage.round(2)}% (required: #{minimum}%)"
    puts "📊 Coverage Report: coverage/coverage.html"
    exit 1
  else
    puts "\n✅ COVERAGE PASSED: #{coverage.round(2)}% (required: #{minimum}%)"
  end
end
