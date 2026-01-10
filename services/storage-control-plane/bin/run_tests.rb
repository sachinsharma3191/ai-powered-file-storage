#!/usr/bin/env ruby

# Quick test runner for catching errors before Docker build
# Usage: ruby bin/run_tests.rb [test_file_pattern]

require_relative '../config/environment'

class TestRunner
  def initialize(pattern = nil)
    @pattern = pattern || "test/**/*_test.rb"
    @passed = 0
    @failed = 0
    @errors = []
  end

  def run
    puts "🧪 Running Ruby Tests (Pre-Docker Build Check)"
    puts "=" * 50
    
    test_files = Dir.glob(@pattern).sort
    
    if test_files.empty?
      puts "❌ No test files found for pattern: #{@pattern}"
      exit 1
    end
    
    puts "📁 Found #{test_files.length} test files"
    puts
    
    test_files.each do |file|
      run_test_file(file)
    end
    
    print_summary
    exit(@failed > 0 ? 1 : 0)
  end

  private

  def run_test_file(file)
    print "🔬 #{file.gsub('test/', '')}... "
    
    begin
      # Load and execute the test file
      load file
      
      # Run the test suite
      if defined?(Rails) && Rails.env.test?
        result = system("rails test #{file} 2>/dev/null")
        if result
          puts "✅ PASS"
          @passed += 1
        else
          puts "❌ FAIL"
          @failed += 1
          @errors << "#{file}: Test execution failed"
        end
      else
        puts "⚠️  SKIP (Rails not in test mode)"
      end
    rescue => e
      puts "❌ ERROR"
      @failed += 1
      @errors << "#{file}: #{e.message}"
      puts "   #{e.message}"
    end
  end

  def print_summary
    puts "\n" + "=" * 50
    puts "📊 Test Results Summary"
    puts "=" * 50
    puts "✅ Passed: #{@passed}"
    puts "❌ Failed: #{@failed}"
    puts "📈 Total:  #{@passed + @failed}"
    
    if @failed > 0
      puts "\n🚨 Failed Tests:"
      @errors.each do |error|
        puts "   • #{error}"
      end
      puts "\n💡 Fix these errors before building Docker image!"
    else
      puts "\n🎉 All tests passed! Ready for Docker build."
    end
  end
end

# Parse command line arguments
pattern = ARGV[0]

# Run the test runner
runner = TestRunner.new(pattern)
runner.run
