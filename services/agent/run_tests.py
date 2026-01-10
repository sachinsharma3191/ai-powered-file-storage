#!/usr/bin/env python3
"""
Test runner for Python agent with comprehensive testing options
"""

import argparse
import asyncio
import os
import sys
import subprocess
from pathlib import Path


def run_command(cmd, cwd=None):
    """Run a command and return the result"""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)
    
    return result.returncode == 0


def run_unit_tests(coverage=False, verbose=False):
    """Run unit tests only"""
    cmd = ["python", "-m", "pytest"]
    
    if verbose:
        cmd.append("-v")
    
    cmd.extend([
        "-m", "unit",
        "tests/",
    ])
    
    if coverage:
        cmd.extend([
            "--cov=core",
            "--cov=models",
            "--cov=main",
            "--cov-report=html",
            "--cov-report=term-missing",
        ])
    
    return run_command(cmd)


def run_integration_tests(verbose=False):
    """Run integration tests (requires external services)"""
    cmd = ["python", "-m", "pytest"]
    
    if verbose:
        cmd.append("-v")
    
    cmd.extend([
        "-m", "integration",
        "tests/",
    ])
    
    return run_command(cmd)


def run_all_tests(coverage=False, verbose=False):
    """Run all tests"""
    cmd = ["python", "-m", "pytest"]
    
    if verbose:
        cmd.append("-v")
    
    cmd.extend(["tests/"])
    
    if coverage:
        cmd.extend([
            "--cov=core",
            "--cov=models", 
            "--cov=main",
            "--cov-report=html",
            "--cov-report=term-missing",
            "--cov-fail-under=80",
        ])
    
    return run_command(cmd)


def run_performance_tests():
    """Run performance benchmarks"""
    cmd = ["python", "-m", "pytest"]
    cmd.extend([
        "-m", "benchmark",
        "--benchmark-only",
        "--benchmark-sort=mean",
        "tests/",
    ])
    
    return run_command(cmd)


def run_linting():
    """Run code linting and formatting checks"""
    success = True
    
    # Black formatting
    print("Checking code formatting with Black...")
    if not run_command(["black", "--check", "core/", "models/", "main.py"]):
        print("Code formatting issues found. Run 'black .' to fix.")
        success = False
    
    # Flake8 linting
    print("Running Flake8 linting...")
    if not run_command(["flake8", "core/", "models/", "main.py"]):
        print("Linting issues found.")
        success = False
    
    # MyPy type checking
    print("Running MyPy type checking...")
    if not run_command(["mypy", "core/", "models/", "main.py"]):
        print("Type checking issues found.")
        success = False
    
    # Security check with bandit
    print("Running security check with Bandit...")
    if not run_command(["bandit", "-r", "core/", "models/", "main.py"]):
        print("Security issues found.")
        success = False
    
    return success


def run_docker_tests():
    """Run tests in Docker environment"""
    print("Running tests in Docker...")
    
    # Build test image
    if not run_command([
        "docker", "build", 
        "-f", "Dockerfile.test",
        "-t", "s3-ai-agent-test",
        "."
    ]):
        return False
    
    # Run tests in container
    if not run_command([
        "docker", "run", "--rm",
        "-v", f"{os.getcwd()}:/app",
        "s3-ai-agent-test",
        "python", "-m", "pytest", "tests/"
    ]):
        return False
    
    return True


def setup_test_environment():
    """Set up test environment"""
    print("Setting up test environment...")
    
    # Install test dependencies
    if not run_command(["pip", "install", "-r", "requirements-test.txt"]):
        print("Failed to install test dependencies")
        return False
    
    # Create test directories
    os.makedirs("test-data", exist_ok=True)
    os.makedirs("test-logs", exist_ok=True)
    os.makedirs("htmlcov", exist_ok=True)
    
    # Set environment variables
    os.environ["TESTING"] = "true"
    os.environ["LOG_LEVEL"] = "DEBUG"
    
    return True


def cleanup_test_environment():
    """Clean up test environment"""
    print("Cleaning up test environment...")
    
    # Remove test data
    import shutil
    for dir_name in ["test-data", "test-logs"]:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
    
    # Clean up Docker containers
    run_command(["docker", "stop", "test-redis"], check=False)
    run_command(["docker", "stop", "test-kafka"], check=False)
    run_command(["docker", "rm", "test-redis"], check=False)
    run_command(["docker", "rm", "test-kafka"], check=False)


def generate_test_report():
    """Generate comprehensive test report"""
    print("Generating test report...")
    
    # Run tests with JSON reporting
    if run_command([
        "python", "-m", "pytest",
        "--json-report",
        "--json-report-file=test-report.json",
        "tests/"
    ]):
        print("Test report generated: test-report.json")
        return True
    
    return False


def main():
    parser = argparse.ArgumentParser(description="Test runner for S3 AI MCP Agent")
    parser.add_argument(
        "command",
        choices=[
            "unit", "integration", "all", "performance", 
            "lint", "docker", "setup", "cleanup", "report"
        ],
        help="Test command to run"
    )
    parser.add_argument(
        "--coverage", "-c",
        action="store_true",
        help="Generate coverage report"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true", 
        help="Verbose output"
    )
    parser.add_argument(
        "--no-cleanup",
        action="store_true",
        help="Don't clean up after tests"
    )
    
    args = parser.parse_args()
    
    # Change to agent directory
    agent_dir = Path(__file__).parent
    os.chdir(agent_dir)
    
    success = True
    
    try:
        if args.command == "setup":
            success = setup_test_environment()
        
        elif args.command == "unit":
            success = run_unit_tests(args.coverage, args.verbose)
        
        elif args.command == "integration":
            success = run_integration_tests(args.verbose)
        
        elif args.command == "all":
            success = run_all_tests(args.coverage, args.verbose)
        
        elif args.command == "performance":
            success = run_performance_tests()
        
        elif args.command == "lint":
            success = run_linting()
        
        elif args.command == "docker":
            success = run_docker_tests()
        
        elif args.command == "report":
            success = generate_test_report()
        
        elif args.command == "cleanup":
            cleanup_test_environment()
    
    except KeyboardInterrupt:
        print("\nTests interrupted by user")
        success = False
    
    except Exception as e:
        print(f"Error running tests: {e}")
        success = False
    
    finally:
        if not args.no_cleanup and args.command not in ["setup", "cleanup"]:
            cleanup_test_environment()
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
